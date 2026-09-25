import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/migrate';

// Applies every migration to a scratch database, rolls 0003 back with the
// documented script, checks the 0002 shape is back, then migrates forward again.
const base = process.env.DATABASE_URL!;
const scratch = base.replace(/\/[^/]+$/, '/baglik_rollback_test');
const admin = postgres(base, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await admin.unsafe('drop database if exists baglik_rollback_test with (force)');
  await admin.end();
});

describe('0003_editorial rollback', () => {
  it('reverts cleanly and can be re-applied', async () => {
    await admin.unsafe('drop database if exists baglik_rollback_test with (force)');
    await admin.unsafe('create database baglik_rollback_test');
    await migrate(scratch, () => {});
    const db = postgres(scratch, { max: 1, onnotice: () => {} });
    try {
      const columns = async () =>
        (
          await db<{ column_name: string }[]>`
            select column_name from information_schema.columns
             where table_name = 'resources' and column_name in ('rationale', 'review_note', 'approved_at')`
        ).length;
      const hasTrigger = async () =>
        (await db`select 1 from pg_trigger where tgname = 'films_after_guard'`).length > 0;
      expect(await columns()).toBe(3);
      expect(await hasTrigger()).toBe(true);

      await db.unsafe(readFileSync('db/rollback/0003_editorial.down.sql', 'utf8'));
      expect(await columns()).toBe(0);
      expect(await hasTrigger()).toBe(false);
      expect(
        (await db`select 1 from schema_migrations where name = '0003_editorial.sql'`).length,
      ).toBe(0);
      const [grant] = await db<{ ok: boolean }[]>`
        select has_column_privilege('baglik_app', 'contributions', 'body', 'UPDATE') as ok`;
      expect(grant!.ok).toBe(true);

      await migrate(scratch, () => {});
      expect(await columns()).toBe(3);
      expect(await hasTrigger()).toBe(true);
    } finally {
      await db.end();
    }
  });
});
