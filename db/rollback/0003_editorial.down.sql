-- Manual rollback of 0003_editorial.sql. Run by hand as the table owner:
--   psql "$DATABASE_URL" -f db/rollback/0003_editorial.down.sql
-- Data written into the new columns is lost by the column drops below —
-- export first if editors have used them. Tested: tests/integration/rollback.test.ts
--
-- Deliberately kept: the row lock in app.set_rsvp. It changes no schema and
-- removing it would bring back the last-seat race.
begin;
drop trigger if exists films_after_guard on films;
drop function if exists app.guard_after_publish();
drop function if exists app.report_link(uuid);
alter table resources drop constraint if exists resources_no_spoiler_before;
alter table resources
  drop column if exists rationale,
  drop column if exists source_minutes,
  drop column if exists provenance,
  drop column if exists approved_at,
  drop column if exists approved_by,
  drop column if exists review_note,
  drop column if exists link_reported_at,
  drop column if exists link_report_count;
grant update (body) on contributions to baglik_app;
create or replace function app.role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from members where id = app.member_id() and status = 'active'
$$;
delete from schema_migrations where name = '0003_editorial.sql';
commit;
