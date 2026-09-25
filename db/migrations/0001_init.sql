-- bağlık.society — initial schema
--
-- Security model (see docs/ARCHITECTURE.md):
--   * Tables are owned by the migration user. The web app switches every
--     member request into the restricted role `baglik_app`
--     (`SET LOCAL ROLE baglik_app`), which has no BYPASSRLS, so the row level
--     security policies below are the real authorisation boundary.
--   * `app.member_id` / `app.mfa` are transaction-local settings written by the
--     server after the session cookie has been verified. Roles are read from
--     `members` on every check; a revoked member instantly loses all access.
--   * Schema `private` (credentials, sessions, rate-limit counters, MFA secrets)
--     is never granted to `baglik_app`; only the audited auth module touches it.

-- ─── roles ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baglik_app') then
    create role baglik_app nologin noinherit nobypassrls;
  end if;
end $$;

-- the connecting user must be able to `SET ROLE baglik_app`
do $$
begin
  execute format('grant baglik_app to %I', current_user);
exception when others then
  raise notice 'grant baglik_app to current_user skipped: %', sqlerrm;
end $$;

create schema if not exists app;
create schema if not exists private;
revoke all on schema private from public;

-- ─── helpers ────────────────────────────────────────────────────────────────
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.member_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.member_id', true), '')::uuid
$$;

create or replace function app.mfa() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.mfa', true), '') = 'on'
$$;

-- ─── members ────────────────────────────────────────────────────────────────
create table members (
  id              uuid primary key default gen_random_uuid(),
  display_name    text not null check (char_length(display_name) between 1 and 80),
  email           text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            text not null default 'member' check (role in ('owner', 'admin', 'editor', 'member')),
  status          text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  privacy_ack_at  timestamptz,
  activated_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references members (id) on delete set null
);
create unique index members_email_key on members (lower(email)) where email is not null;
create trigger members_touch before update on members for each row execute function app.touch_updated_at();

-- role lookups run as definer so policies can read `members` without
-- granting members-table visibility to everyone
create or replace function app.role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from members where id = app.member_id() and status = 'active'
$$;

create or replace function app.is_member() returns boolean
language sql stable as $$ select app.role() is not null $$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select coalesce(app.role() in ('owner', 'admin', 'editor'), false) $$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select coalesce(app.role() in ('owner', 'admin'), false) $$;

-- owner/admin *with* a fresh second factor on this session
create or replace function app.is_admin_mfa() returns boolean
language sql stable as $$ select app.is_admin() and app.mfa() $$;

-- ─── private: auth internals ────────────────────────────────────────────────
create table private.credentials (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references members (id) on delete cascade,
  kind           text not null check (kind in ('key', 'invite', 'recovery')),
  selector       text not null unique,
  verifier_hash  text not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references members (id) on delete set null,
  expires_at     timestamptz,
  used_at        timestamptz,
  revoked_at     timestamptz
);
create index credentials_member_idx on private.credentials (member_id);

create table private.sessions (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references members (id) on delete cascade,
  token_hash       bytea not null unique,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz not null default now(),
  idle_expires_at  timestamptz not null,
  expires_at       timestamptz not null,
  mfa_verified_at  timestamptz,
  revoked_at       timestamptz,
  user_agent       text
);
create index sessions_member_idx on private.sessions (member_id);

create table private.auth_attempts (
  id       bigserial primary key,
  bucket   text not null,
  success  boolean not null,
  at       timestamptz not null default now()
);
create index auth_attempts_bucket_idx on private.auth_attempts (bucket, at desc);

create table private.member_mfa (
  member_id   uuid primary key references members (id) on delete cascade,
  secret_enc  text not null,
  enabled_at  timestamptz,
  last_step   bigint,
  created_at  timestamptz not null default now()
);

-- ─── films ──────────────────────────────────────────────────────────────────
create table films (
  id                  uuid primary key default gen_random_uuid(),
  program_no          int unique check (program_no > 0),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (char_length(title) between 1 and 160),
  title_original      text,
  year                int check (year between 1880 and 2100),
  director            text,
  runtime_min         int check (runtime_min > 0),
  runtime_source      text,
  country             text,
  language            text,
  intro               text,
  themes              text[] not null default '{}',
  status              text not null default 'oneri'
                        check (status in ('oneri', 'secildi', 'yaklasiyor', 'izlendi', 'arsiv')),
  sort_key            int,
  screened_on         date,
  curator_credit      text,
  reading_label       text,
  image_credit        text,
  image_rights        text,
  published_at        timestamptz,
  after_published_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references members (id) on delete set null,
  updated_by          uuid references members (id) on delete set null
);
create trigger films_touch before update on films for each row execute function app.touch_updated_at();

create or replace function app.film_visible(f films) returns boolean
language sql stable as $$
  select f.published_at is not null and f.published_at <= now()
$$;

create or replace function app.film_after_visible(p_film uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from films f
    where f.id = p_film
      and f.published_at is not null and f.published_at <= now()
      and f.after_published_at is not null and f.after_published_at <= now()
  )
$$;

create or replace function app.film_before_visible(p_film uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from films f
    where f.id = p_film and f.published_at is not null and f.published_at <= now()
  )
$$;

-- ─── resources (editorial source records) ───────────────────────────────────
create table resources (
  id                uuid primary key default gen_random_uuid(),
  film_id           uuid not null references films (id) on delete cascade,
  layer             text not null check (layer in ('once', 'sonra')),
  section           text not null default 'okuma' check (section in ('okuma', 'izleme', 'eslik')),
  position          int not null default 0,
  kind              text not null
                      check (kind in ('article', 'interview', 'video', 'podcast', 'music', 'essay', 'book', 'film', 'official', 'other')),
  heading           text check (heading is null or char_length(heading) between 1 and 200),
  title_original    text check (title_original is null or char_length(title_original) between 1 and 300),
  author            text,
  publication       text,
  form_label        text,
  language          text,
  published_year    int check (published_year between 1800 and 2100),
  duration_note     text,
  url               text check (url is null or url ~ '^https?://[^\s]+$'),
  link_label        text,
  link_hint         text,
  access_note       text,
  spoiler_level     text not null default 'belirtilmedi'
                      check (spoiler_level in ('yok', 'hafif', 'var', 'belirtilmedi')),
  note              text,
  prompt            text,
  quote             text,
  quote_credit      text,
  rights_status     text not null default 'baglanti'
                      check (rights_status in ('baglanti', 'ozgun_ozet', 'lisansli_ceviri', 'kendi_icerigi')),
  rights_note       text,
  status            text not null default 'taslak' check (status in ('taslak', 'yayinda')),
  published_at      timestamptz,
  link_status       text not null default 'denetlenmedi'
                      check (link_status in ('denetlenmedi', 'saglam', 'yonlendirme', 'kirik', 'hata')),
  link_checked_at   timestamptz,
  link_http_status  int,
  link_final_url    text,
  link_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references members (id) on delete set null,
  updated_by        uuid references members (id) on delete set null,
  constraint resources_has_title check (heading is not null or title_original is not null)
);
create index resources_film_idx on resources (film_id, layer, section, position);
create trigger resources_touch before update on resources for each row execute function app.touch_updated_at();

create table link_checks (
  id           bigserial primary key,
  resource_id  uuid not null references resources (id) on delete cascade,
  checked_at   timestamptz not null default now(),
  ok           boolean not null,
  http_status  int,
  final_url    text,
  error        text,
  duration_ms  int
);
create index link_checks_resource_idx on link_checks (resource_id, checked_at desc);

-- ─── questions & session notes ──────────────────────────────────────────────
create table questions (
  id          uuid primary key default gen_random_uuid(),
  film_id     uuid not null references films (id) on delete cascade,
  layer       text not null check (layer in ('once', 'sonra')),
  body        text not null check (char_length(body) between 1 and 400),
  position    int not null default 0,
  status      text not null default 'taslak' check (status in ('taslak', 'yayinda')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references members (id) on delete set null
);
create trigger questions_touch before update on questions for each row execute function app.touch_updated_at();

create table screening_notes (
  id             uuid primary key default gen_random_uuid(),
  film_id        uuid not null references films (id) on delete cascade,
  title          text not null default 'oturum notları',
  body           text not null default '',
  author_credit  text,
  status         text not null default 'taslak' check (status in ('taslak', 'yayinda')),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references members (id) on delete set null
);
create trigger screening_notes_touch before update on screening_notes for each row execute function app.touch_updated_at();

-- ─── events / invitations ───────────────────────────────────────────────────
create table events (
  id                    uuid primary key default gen_random_uuid(),
  number                int unique check (number > 0),
  title                 text,
  starts_at             timestamptz not null,
  ends_at               timestamptz check (ends_at is null or ends_at > starts_at),
  timezone              text not null default 'Europe/Istanbul',
  status                text not null default 'taslak'
                          check (status in ('taslak', 'davet', 'ertelendi', 'iptal', 'tamamlandi')),
  status_note           text,
  rsvp_deadline         timestamptz,
  capacity              int check (capacity is null or capacity > 0),
  location_public_note  text not null default 'konum etkinlik günü davetlilere iletilecektir',
  guest_list_visible    boolean not null default false,
  ics_sequence          int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references members (id) on delete set null
);
create trigger events_touch before update on events for each row execute function app.touch_updated_at();

create table event_films (
  event_id  uuid not null references events (id) on delete cascade,
  film_id   uuid not null references films (id) on delete cascade,
  position  int not null default 0,
  primary key (event_id, film_id)
);

-- real location + admin notes: owner/admin (with MFA) only
create table event_private (
  event_id             uuid primary key references events (id) on delete cascade,
  location_text        text,
  location_url         text check (location_url is null or location_url ~ '^https?://[^\s]+$'),
  location_directions  text,
  release_at           timestamptz,
  released_at          timestamptz,
  release_audience     text not null default 'katilanlar' check (release_audience in ('katilanlar', 'davetliler')),
  include_in_email     boolean not null default false,
  admin_note           text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references members (id) on delete set null
);
create trigger event_private_touch before update on event_private for each row execute function app.touch_updated_at();

create table event_invitees (
  event_id    uuid not null references events (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  status      text not null default 'davetli' check (status in ('davetli', 'iptal')),
  rsvp        text check (rsvp in ('geliyorum', 'gelemiyorum', 'belirsiz')),
  rsvp_note   text check (rsvp_note is null or char_length(rsvp_note) <= 280),
  rsvp_at     timestamptz,
  invited_at  timestamptz not null default now(),
  invited_by  uuid references members (id) on delete set null,
  primary key (event_id, member_id)
);
create index event_invitees_member_idx on event_invitees (member_id);

create or replace function app.is_invited(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from event_invitees i
    join members m on m.id = i.member_id and m.status = 'active'
    where i.event_id = p_event and i.member_id = app.member_id() and i.status = 'davetli'
  )
$$;

-- ─── personal journal & collective memory ───────────────────────────────────
create table journal_entries (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members (id) on delete cascade,
  film_id           uuid references films (id) on delete set null,
  kind              text not null default 'serbest' check (kind in ('beklenti', 'hatira', 'serbest')),
  body              text not null check (char_length(body) between 1 and 5000),
  visibility        text not null default 'ozel' check (visibility in ('ozel', 'paylasildi')),
  attribution       text not null default 'isimli' check (attribution in ('isimli', 'anonim')),
  attribution_name  text,
  shared_at         timestamptz,
  moderation        text not null default 'gorunur' check (moderation in ('gorunur', 'gizlendi')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index journal_member_idx on journal_entries (member_id, created_at desc);
create trigger journal_touch before update on journal_entries for each row execute function app.touch_updated_at();

create table contributions (
  id                uuid primary key default gen_random_uuid(),
  film_id           uuid not null references films (id) on delete cascade,
  question_id       uuid references questions (id) on delete set null,
  parent_id         uuid references contributions (id) on delete cascade,
  depth             int not null default 0 check (depth between 0 and 2),
  member_id         uuid not null references members (id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 1200),
  attribution       text not null default 'isimli' check (attribution in ('isimli', 'anonim')),
  attribution_name  text,
  status            text not null default 'yayinda' check (status in ('yayinda', 'geri_cekildi', 'kaldirildi')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index contributions_film_idx on contributions (film_id, created_at);
create trigger contributions_touch before update on contributions for each row execute function app.touch_updated_at();

create or replace function app.contribution_depth() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare parent_depth int; parent_film uuid;
begin
  if new.parent_id is null then
    new.depth := 0;
  else
    select depth, film_id into parent_depth, parent_film from contributions where id = new.parent_id;
    if parent_depth is null or parent_film <> new.film_id then
      raise exception 'invalid parent';
    end if;
    new.depth := parent_depth + 1;
  end if;
  return new;
end $$;
create trigger contributions_depth before insert on contributions for each row execute function app.contribution_depth();

create table resource_marks (
  member_id    uuid not null references members (id) on delete cascade,
  resource_id  uuid not null references resources (id) on delete cascade,
  read_at      timestamptz,
  saved_at     timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (member_id, resource_id)
);

-- ─── operations ─────────────────────────────────────────────────────────────
create table notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('kurtarma_kodu', 'konum', 'hatirlatma', 'davet')),
  member_id            uuid references members (id) on delete set null,
  event_id             uuid references events (id) on delete set null,
  channel              text not null check (channel in ('email', 'manuel')),
  status               text not null check (status in ('beklemede', 'gonderildi', 'hata', 'saglayici_yok', 'adres_yok', 'manuel')),
  provider             text,
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz,
  created_by           uuid references members (id) on delete set null
);
create index deliveries_created_idx on notification_deliveries (created_at desc);

create table audit_logs (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid references members (id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    text,
  meta         jsonb not null default '{}'::jsonb,
  ip_hash      text
);
create index audit_logs_at_idx on audit_logs (at desc);

create or replace function app.audit(p_action text, p_target_type text, p_target_id text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into audit_logs (actor_id, action, target_type, target_id, meta)
  select app.member_id(), p_action, p_target_type, p_target_id, coalesce(p_meta, '{}'::jsonb)
  where app.is_member()
$$;
