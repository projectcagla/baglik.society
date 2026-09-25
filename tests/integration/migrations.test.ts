import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/migrate';

// Scratch databases only. The upgrade test starts from the v1 schema
// (0001–0002) with v1-shaped data, then applies every later migration; the
// rollback test walks 0004 and 0003 back with the documented scripts.
const base = process.env.DATABASE_URL!;
const admin = postgres(base, { max: 1, onnotice: () => {} });
const scratch = (name: string) => base.replace(/\/[^/]+$/, `/${name}`);

async function fresh(name: string) {
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.unsafe(`create database ${name}`);
  return scratch(name);
}

afterAll(async () => {
  for (const name of ['baglik_upgrade_test', 'baglik_rollback_test'])
    await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.end();
});

describe('upgrading a v1 database', () => {
  it('keeps every row, keeps published sources up, and applies the new rules from then on', async () => {
    const url = await fresh('baglik_upgrade_test');
    await migrate(url, () => {}, { until: '0002_rls.sql' });
    const db = postgres(url, { max: 1, onnotice: () => {} });
    try {
      // v1 data: a member, a film, a published external source, a contribution, an RSVP
      const [m] = await db<{ id: string }[]>`
        insert into members (display_name, role, status, activated_at)
        values ('v1 üye', 'member', 'active', now()) returning id`;
      const [f] = await db<{ id: string }[]>`
        insert into films (slug, title, status, published_at, after_published_at)
        values ('v1-film', 'v1 film', 'izlendi', now(), now()) returning id`;
      const [r] = await db<{ id: string }[]>`
        insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status, status, published_at)
        values (${f!.id}, 'once', 'okuma', 'article', 'v1 kaynak', 'https://example.org/v1', 'yok', 'baglanti', 'yayinda', now())
        returning id`;
      await db`insert into contributions (film_id, member_id, body, attribution)
               values (${f!.id}, ${m!.id}, 'v1 katkı', 'isimli')`;
      const counts = async () =>
        (
          await db<{ n: string }[]>`
            select (select count(*) from members) || '/' || (select count(*) from films) || '/' ||
                   (select count(*) from resources) || '/' || (select count(*) from contributions) as n`
        )[0]!.n;
      const before = await counts();

      await migrate(url, () => {});
      expect(await counts()).toBe(before);

      // the v1 source is still published, now visibly waiting for a person's approval
      const [after] = await db<{ status: string; approved_at: Date | null }[]>`
        select status, approved_at from resources where id = ${r!.id}`;
      expect(after).toEqual({ status: 'yayinda', approved_at: null });
      // editing its text keeps it up; changing its link sends it back to the desk
      await db`update resources set note = 'yeni not' where id = ${r!.id}`;
      expect((await db`select status from resources where id = ${r!.id}`)[0]!.status).toBe(
        'yayinda',
      );
      await db`update resources set url = 'https://example.org/v1-yeni' where id = ${r!.id}`;
      expect((await db`select status from resources where id = ${r!.id}`)[0]!.status).toBe(
        'taslak',
      );
      // and it cannot go back up without a person
      await expect(
        db`update resources set status = 'yayinda', published_at = now() where id = ${r!.id}`,
      ).rejects.toThrow(/publication requires human approval/);
      // v1 contributions keep their text; editing it is no longer possible for the app role
      const [grant] = await db<{ ok: boolean }[]>`
        select has_column_privilege('baglik_app', 'contributions', 'body', 'UPDATE') as ok`;
      expect(grant!.ok).toBe(false);
    } finally {
      await db.end();
    }
  });
});

describe('rollback scripts', () => {
  it('0004 then 0003 revert cleanly, and both can be re-applied', async () => {
    const url = await fresh('baglik_rollback_test');
    await migrate(url, () => {});
    const db = postgres(url, { max: 1, onnotice: () => {} });
    try {
      const column = async (name: string) =>
        (
          await db`select 1 from information_schema.columns
                    where table_name = 'resources' and column_name = ${name}`
        ).length > 0;
      const trigger = async (name: string) =>
        (await db`select 1 from pg_trigger where tgname = ${name}`).length > 0;
      const applied = async (name: string) =>
        (await db`select 1 from schema_migrations where name = ${name}`).length > 0;

      expect(await column('rationale_draft')).toBe(true);
      expect(await trigger('resources_publication_guard')).toBe(true);
      await db.unsafe(readFileSync('db/rollback/0004_release.down.sql', 'utf8'));
      expect(await column('rationale_draft')).toBe(false);
      expect(await trigger('resources_publication_guard')).toBe(false);
      expect(await applied('0004_release.sql')).toBe(false);

      expect(await column('rationale')).toBe(true);
      expect(await trigger('films_after_guard')).toBe(true);
      await db.unsafe(readFileSync('db/rollback/0003_editorial.down.sql', 'utf8'));
      expect(await column('rationale')).toBe(false);
      expect(await trigger('films_after_guard')).toBe(false);
      expect(await applied('0003_editorial.sql')).toBe(false);
      const [grant] = await db<{ ok: boolean }[]>`
        select has_column_privilege('baglik_app', 'contributions', 'body', 'UPDATE') as ok`;
      expect(grant!.ok).toBe(true);

      await migrate(url, () => {});
      expect(await column('rationale')).toBe(true);
      expect(await column('rationale_draft')).toBe(true);
      expect(await trigger('resources_publication_guard')).toBe(true);
    } finally {
      await db.end();
    }
  });
});
