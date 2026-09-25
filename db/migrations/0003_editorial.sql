-- bağlık.society — v1.1 editorial-first
--
-- Additive and data-preserving: new nullable columns, one NOT VALID check,
-- replaced functions, one trigger, one narrowed grant, and review flags on
-- rows that came from the early PDFs (only where no editor note exists).
-- Manual rollback: db/rollback/0003_editorial.down.sql

-- ─── 1. RSVP: capacity is checked under a row lock ──────────────────────────
-- Two members racing for the last seat used to both pass the count (READ
-- COMMITTED sees neither's uncommitted row). Locking the event row serialises
-- RSVPs per event; everything else about the rule is unchanged.
create or replace function app.set_rsvp(p_event uuid, p_rsvp text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ev events;
begin
  if p_rsvp not in ('geliyorum', 'gelemiyorum', 'belirsiz') then
    raise exception 'invalid rsvp' using errcode = '22023';
  end if;
  if not app.is_invited(p_event) then
    raise exception 'not invited' using errcode = '42501';
  end if;
  select * into ev from events where id = p_event for update;
  if ev.status not in ('davet', 'ertelendi') then
    raise exception 'event closed' using errcode = '55000';
  end if;
  if ev.rsvp_deadline is not null and ev.rsvp_deadline < now() then
    raise exception 'rsvp deadline passed' using errcode = '55000';
  end if;
  if p_rsvp = 'geliyorum' and ev.capacity is not null and (
       select count(*) from event_invitees
        where event_id = p_event and status = 'davetli' and rsvp = 'geliyorum'
          and member_id <> app.member_id()
     ) >= ev.capacity then
    raise exception 'capacity reached' using errcode = '55000';
  end if;
  update event_invitees
     set rsvp = p_rsvp, rsvp_note = nullif(trim(p_note), ''), rsvp_at = now()
   where event_id = p_event and member_id = app.member_id();
  perform app.audit('rsvp.set', 'event', p_event::text, jsonb_build_object('rsvp', p_rsvp));
end $$;

-- ─── 2. "üye gibi gör": staff preview with member rights, enforced by RLS ───
-- When the server sets app.preview = 'member', every role check answers as
-- for a plain member, so drafts and closed layers never leave the database.
create or replace function app.role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when coalesce(current_setting('app.preview', true), '') = 'member' then 'member'
           else role
         end
    from members where id = app.member_id() and status = 'active'
$$;

-- ─── 3. editorial fields on source records ──────────────────────────────────
alter table resources
  add column if not exists rationale          text,        -- why the curator chose it (2–3 sentences)
  add column if not exists source_minutes     int check (source_minutes is null or source_minutes between 1 and 600),
  add column if not exists provenance         text,        -- where the record came from (file, editor…)
  add column if not exists approved_at        timestamptz, -- last human check of bibliography + link
  add column if not exists approved_by        uuid references members (id) on delete set null,
  add column if not exists review_note        text,        -- open editorial question for the desk
  add column if not exists link_reported_at   timestamptz, -- a member said the link does not work
  add column if not exists link_report_count  int not null default 0;

-- Spoiler contract: a source that reveals the film cannot be *published* in
-- the pre-screening layer. NOT VALID keeps any existing row untouched; every
-- new write is checked.
alter table resources
  add constraint resources_no_spoiler_before
  check (status <> 'yayinda' or layer <> 'once' or spoiler_level <> 'var') not valid;

-- ─── 4. the after layer opens only after a screening, and only by hand ─────
create or replace function app.guard_after_publish() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.after_published_at is not null and old.after_published_at is null then
    if new.status not in ('izlendi', 'arsiv') and not exists (
         select 1 from event_films ef join events e on e.id = ef.event_id
          where ef.film_id = new.id and e.status <> 'iptal' and e.starts_at <= now()
       ) then
      raise exception 'after layer requires a screening' using errcode = '55000';
    end if;
  end if;
  return new;
end $$;
create trigger films_after_guard before update of after_published_at on films
  for each row execute function app.guard_after_publish();

-- ─── 5. discussion: no silent edits ─────────────────────────────────────────
-- Members may withdraw a contribution, not rewrite it after others replied.
revoke update (body) on contributions from baglik_app;

-- ─── 6. a member can flag a source link that does not work ─────────────────
create or replace function app.report_link(p_resource uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (
    select 1 from resources r
     where r.id = p_resource and r.status = 'yayinda'
       and case r.layer when 'once' then app.film_before_visible(r.film_id)
                        else app.film_after_visible(r.film_id) end
  ) then
    raise exception 'not found' using errcode = '42704';
  end if;
  -- one report per member and source per day
  if exists (
    select 1 from audit_logs
     where action = 'link.report' and actor_id = app.member_id() and target_id = p_resource::text
       and at > now() - interval '1 day'
  ) then
    return;
  end if;
  update resources set link_reported_at = now(), link_report_count = link_report_count + 1
   where id = p_resource;
  perform app.audit('link.report', 'resource', p_resource::text, '{}'::jsonb);
end $$;

grant execute on all functions in schema app to baglik_app;

-- ─── 7. provenance and open questions for rows seeded from the PDFs ─────────
update resources r set provenance = 'pdf: 002_canavar_pre_reading_mobile.pdf'
  from films f
 where f.id = r.film_id and f.slug = '002-canavar' and r.provenance is null and r.created_by is null;

update resources r set provenance = 'pdf: 001_drive_my_car_short_reading.pdf'
  from films f
 where f.id = r.film_id and f.slug = '001-drive-my-car' and r.provenance is null and r.created_by is null;

update resources r
   set review_note = 'erken PDF seçkisinden (kitap / film önerisi). sonraki makale–söyleşi ağırlıklı minimalist sürümle karşılaştırılmalı; o dosya henüz sisteme eklenmedi.'
  from films f
 where f.id = r.film_id and f.slug = '001-drive-my-car' and r.kind in ('book', 'film')
   and r.review_note is null and r.created_by is null;
