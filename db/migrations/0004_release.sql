-- bağlık.society — release 2026-09: human approval is a publishing rule
--
-- Additive and data-preserving. A source that points outside the club (it has
-- a URL) can only move to "yayinda" once a signed-in person has approved its
-- bibliography and link. The database enforces it, so no path — the desk, a
-- script, a racing edit, a seed — can publish an unapproved external source.
--
-- Rows already published before this migration (v1 / early seed) are not
-- taken down: they stay visible and wait in the desk queue. The first time
-- their link or bibliography changes they go back to draft like any other.
-- Manual rollback: db/rollback/0004_release.down.sql

-- ─── 1. an editor-only suggestion for "neden bu kaynak" ─────────────────────
-- Never shown to members (stripped by the DAL like review_note). An editor may
-- adopt it into `rationale`; it is never published on its own.
alter table resources add column if not exists rationale_draft text;

-- ─── 2. approval and publication guard ──────────────────────────────────────
create or replace function app.guard_resource_publication() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bib_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    bib_changed := (new.url, new.title_original, new.author, new.publication, new.published_year)
      is distinct from (old.url, old.title_original, old.author, old.publication, old.published_year);
    if bib_changed then
      -- what a person confirmed is no longer what is on the record
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;

  -- an approval belongs to the signed-in person who gave it; scripts, seeds
  -- and the link checker (no member in context) cannot approve anything
  if new.approved_at is not null
     and (tg_op = 'INSERT' or new.approved_at is distinct from old.approved_at) then
    if app.member_id() is null then
      raise exception 'approval requires a person' using errcode = '42501';
    end if;
    new.approved_by := app.member_id();
  end if;

  if new.status = 'yayinda' and new.url is not null and new.approved_at is null then
    if tg_op = 'INSERT' or old.status <> 'yayinda' then
      raise exception 'publication requires human approval' using errcode = '55000';
    end if;
    if bib_changed then
      -- a published source whose link or bibliography changed goes back to the desk
      new.status := 'taslak';
      new.published_at := null;
    end if;
    -- otherwise: published before 0004 and untouched; it waits in the queue
  end if;
  return new;
end $$;

drop trigger if exists resources_publication_guard on resources;
create trigger resources_publication_guard before insert or update on resources
  for each row execute function app.guard_resource_publication();

grant execute on all functions in schema app to baglik_app;
