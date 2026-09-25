-- Manual rollback of 0004_release.sql. Run by hand as the table owner, after a
-- backup:
--   psql "$DATABASE_URL" -f db/rollback/0004_release.down.sql
-- Removes the publication guard (unapproved external sources could be
-- published again) and drops `rationale_draft` — editor suggestions stored
-- there are lost. Nothing else is touched. Tested: tests/integration/migrations.test.ts
begin;
drop trigger if exists resources_publication_guard on resources;
drop function if exists app.guard_resource_publication();
alter table resources drop column if exists rationale_draft;
delete from schema_migrations where name = '0004_release.sql';
commit;
