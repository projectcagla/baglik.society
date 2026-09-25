-- bağlık.society — row level security, member functions and grants
--
-- Matrix (A = anonymous, M = member, E = editor, O = owner/admin with MFA)
--   films/resources/questions   A: –   M: published only   E/O: all (drafts too)
--   after layer ("sonra")       M: only when film.after_published_at is set
--   events                      M: only events they are invited to     E: read   O: write
--   event_private (location)    O only. Members get it through app.event_location()
--   event_invitees              M: own row (RSVP via app.set_rsvp)     O: all
--   journal_entries             owner of the entry; shared entries readable by members
--   contributions               visible once the after layer is published
--   audit/deliveries            O only

-- ─── films ──────────────────────────────────────────────────────────────────
alter table films enable row level security;
create policy films_read on films for select to baglik_app
  using ((select app.is_staff()) or ((select app.is_member()) and app.film_visible(films)));
create policy films_insert on films for insert to baglik_app with check ((select app.is_staff()));
create policy films_update on films for update to baglik_app
  using ((select app.is_staff())) with check ((select app.is_staff()));
create policy films_delete on films for delete to baglik_app using ((select app.is_admin_mfa()));

-- ─── resources ──────────────────────────────────────────────────────────────
alter table resources enable row level security;
create policy resources_read on resources for select to baglik_app using (
  (select app.is_staff())
  or (
    (select app.is_member())
    and status = 'yayinda'
    and case layer
          when 'once' then app.film_before_visible(film_id)
          else app.film_after_visible(film_id)
        end
  )
);
create policy resources_insert on resources for insert to baglik_app with check ((select app.is_staff()));
create policy resources_update on resources for update to baglik_app
  using ((select app.is_staff())) with check ((select app.is_staff()));
create policy resources_delete on resources for delete to baglik_app using ((select app.is_staff()));

alter table link_checks enable row level security;
create policy link_checks_read on link_checks for select to baglik_app using ((select app.is_staff()));
create policy link_checks_insert on link_checks for insert to baglik_app with check ((select app.is_staff()));

-- ─── questions & notes ──────────────────────────────────────────────────────
alter table questions enable row level security;
create policy questions_read on questions for select to baglik_app using (
  (select app.is_staff())
  or (
    (select app.is_member())
    and status = 'yayinda'
    and case layer
          when 'once' then app.film_before_visible(film_id)
          else app.film_after_visible(film_id)
        end
  )
);
create policy questions_write on questions for all to baglik_app
  using ((select app.is_staff())) with check ((select app.is_staff()));

alter table screening_notes enable row level security;
create policy screening_notes_read on screening_notes for select to baglik_app using (
  (select app.is_staff())
  or ((select app.is_member()) and status = 'yayinda' and app.film_after_visible(film_id))
);
create policy screening_notes_write on screening_notes for all to baglik_app
  using ((select app.is_staff())) with check ((select app.is_staff()));

-- ─── members ────────────────────────────────────────────────────────────────
alter table members enable row level security;
create policy members_self on members for select to baglik_app
  using (id = (select app.member_id()) or (select app.is_admin_mfa()));
create policy members_admin_insert on members for insert to baglik_app with check ((select app.is_admin_mfa()));
create policy members_admin_update on members for update to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));
create policy members_admin_delete on members for delete to baglik_app using ((select app.is_admin_mfa()));

-- only an owner may create/modify owners and admins
-- not security definer: it must see the caller's current_user
create or replace function app.guard_member_roles() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'baglik_app' then
    if (tg_op = 'INSERT' and new.role in ('owner', 'admin'))
       or (tg_op = 'UPDATE' and (old.role in ('owner', 'admin') or new.role in ('owner', 'admin'))
           and (old.role is distinct from new.role or old.status is distinct from new.status)) then
      if app.role() <> 'owner' then
        raise exception 'only an owner can change admin roles' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'UPDATE' and old.id = app.member_id() and new.role is distinct from old.role then
      raise exception 'cannot change own role' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger members_role_guard before insert or update on members
  for each row execute function app.guard_member_roles();

create or replace function app.update_own_profile(p_display_name text, p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  update members
     set display_name = p_display_name,
         email = nullif(trim(p_email), '')
   where id = app.member_id();
end $$;

create or replace function app.ack_privacy() returns void
language sql security definer set search_path = public, pg_temp as $$
  update members set privacy_ack_at = now() where id = app.member_id() and app.is_member()
$$;

-- ─── events ─────────────────────────────────────────────────────────────────
alter table events enable row level security;
create policy events_read on events for select to baglik_app using (
  (select app.is_staff()) or (status <> 'taslak' and app.is_invited(id))
);
create policy events_write on events for all to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));

alter table event_films enable row level security;
create policy event_films_read on event_films for select to baglik_app using (
  (select app.is_staff()) or app.is_invited(event_id)
);
create policy event_films_write on event_films for all to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));

alter table event_private enable row level security;
create policy event_private_admin on event_private for all to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));

alter table event_invitees enable row level security;
create policy invitees_read on event_invitees for select to baglik_app
  using (member_id = (select app.member_id()) or (select app.is_admin_mfa()));
create policy invitees_write on event_invitees for all to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));

-- RSVP: the only path a member has to write to event_invitees
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
  select * into ev from events where id = p_event;
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

-- Location release rule, evaluated in the database so no caller can get it
-- wrong. Returns a state and — only when state = 'acik' — the location.
--   yok            not invited (or not a member)
--   iptal          event cancelled
--   gizli          release time not reached / not scheduled
--   katilim_gerekli released to attendees only and viewer has not said yes
--   paylasilmadi   released, but no real location has been entered
--   acik           visible
create or replace function app.event_location(p_event uuid)
returns table (state text, location_text text, location_url text, location_directions text, released_from timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  ev events;
  pv event_private;
  inv event_invitees;
  eff timestamptz;
begin
  if not app.is_invited(p_event) then
    return query select 'yok'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select * into ev from events where id = p_event;
  if ev.status = 'iptal' then
    return query select 'iptal'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select * into pv from event_private where event_id = p_event;
  eff := coalesce(pv.released_at, pv.release_at);
  if pv.event_id is null or eff is null or eff > now() then
    return query select 'gizli'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select * into inv from event_invitees where event_id = p_event and member_id = app.member_id();
  if pv.release_audience = 'katilanlar' and inv.rsvp is distinct from 'geliyorum' then
    return query select 'katilim_gerekli'::text, null::text, null::text, null::text, eff;
    return;
  end if;
  if pv.location_text is null or btrim(pv.location_text) = '' then
    return query select 'paylasilmadi'::text, null::text, null::text, null::text, eff;
    return;
  end if;
  return query select 'acik'::text, pv.location_text, pv.location_url, pv.location_directions, eff;
end $$;

-- Optional guest list: names of members who said yes, only when the admin
-- enabled it for the event and only to invited members.
create or replace function app.event_guest_list(p_event uuid)
returns table (display_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.display_name
    from event_invitees i
    join members m on m.id = i.member_id and m.status = 'active'
    join events e on e.id = i.event_id
   where i.event_id = p_event
     and e.guest_list_visible
     and i.status = 'davetli' and i.rsvp = 'geliyorum'
     and app.is_invited(p_event)
   order by m.display_name
$$;

-- ─── journal ────────────────────────────────────────────────────────────────
alter table journal_entries enable row level security;
create policy journal_read on journal_entries for select to baglik_app using (
  member_id = (select app.member_id())
  or ((select app.is_member()) and visibility = 'paylasildi' and moderation = 'gorunur')
  or ((select app.is_admin_mfa()) and visibility = 'paylasildi')
);
create policy journal_insert on journal_entries for insert to baglik_app
  with check (member_id = (select app.member_id()) and (select app.is_member()));
create policy journal_update on journal_entries for update to baglik_app
  using (member_id = (select app.member_id())) with check (member_id = (select app.member_id()));
create policy journal_delete on journal_entries for delete to baglik_app
  using (member_id = (select app.member_id()));

create or replace function app.moderate_journal(p_id uuid, p_state text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin_mfa() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_state not in ('gorunur', 'gizlendi') then raise exception 'invalid state'; end if;
  update journal_entries set moderation = p_state where id = p_id and visibility = 'paylasildi';
  perform app.audit('journal.moderate', 'journal_entry', p_id::text, jsonb_build_object('state', p_state));
end $$;

-- ─── contributions ──────────────────────────────────────────────────────────
alter table contributions enable row level security;
create policy contributions_read on contributions for select to baglik_app using (
  member_id = (select app.member_id())
  or ((select app.is_member()) and status = 'yayinda' and app.film_after_visible(film_id))
  or ((select app.is_admin_mfa()))
);
create policy contributions_insert on contributions for insert to baglik_app with check (
  member_id = (select app.member_id()) and (select app.is_member())
  and status = 'yayinda' and app.film_after_visible(film_id)
);
create policy contributions_update on contributions for update to baglik_app
  using (member_id = (select app.member_id()) and status <> 'kaldirildi')
  with check (member_id = (select app.member_id()) and status in ('yayinda', 'geri_cekildi'));

create or replace function app.moderate_contribution(p_id uuid, p_state text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin_mfa() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_state not in ('yayinda', 'kaldirildi') then raise exception 'invalid state'; end if;
  update contributions set status = p_state where id = p_id;
  perform app.audit('contribution.moderate', 'contribution', p_id::text, jsonb_build_object('state', p_state));
end $$;

-- ─── reading marks ──────────────────────────────────────────────────────────
alter table resource_marks enable row level security;
create policy marks_own on resource_marks for all to baglik_app
  using (member_id = (select app.member_id()))
  with check (member_id = (select app.member_id()) and (select app.is_member()));

-- ─── operations ─────────────────────────────────────────────────────────────
alter table notification_deliveries enable row level security;
create policy deliveries_admin on notification_deliveries for all to baglik_app
  using ((select app.is_admin_mfa())) with check ((select app.is_admin_mfa()));

alter table audit_logs enable row level security;
create policy audit_admin_read on audit_logs for select to baglik_app using ((select app.is_admin_mfa()));

-- ─── grants ─────────────────────────────────────────────────────────────────
grant usage on schema public, app to baglik_app;
revoke all on all tables in schema public from baglik_app;

grant select, insert, update, delete on films, resources, questions, screening_notes to baglik_app;
grant select, insert on link_checks to baglik_app;
grant select, insert, update, delete on events, event_films, event_private, event_invitees to baglik_app;
grant select, insert, delete on members to baglik_app;
grant update (display_name, email, role, status, activated_at, revoked_at) on members to baglik_app;
grant select, insert, delete on journal_entries to baglik_app;
grant update (film_id, kind, body, visibility, attribution, attribution_name, shared_at) on journal_entries to baglik_app;
grant select, insert on contributions to baglik_app;
grant update (body, status) on contributions to baglik_app;
grant select, insert, update, delete on resource_marks to baglik_app;
grant select, insert, update on notification_deliveries to baglik_app;
grant select on audit_logs to baglik_app;
grant usage on all sequences in schema public to baglik_app;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to baglik_app;
