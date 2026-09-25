// Prepares a throwaway database for the Playwright suite and prints the
// demo credentials as JSON. Refuses to touch anything that is not an e2e/test DB.
import { writeFileSync, mkdirSync } from 'node:fs';
import postgres from 'postgres';
import { migrate } from './migrate';
import { seed } from './seed';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/e2e|test/.test(url)) throw new Error(`refusing to reset ${url}`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop schema if exists app cascade; drop schema if exists private cascade;
                    drop schema if exists public cascade; create schema public;`);
  await sql.end();
  await migrate(url, () => {});
  await seed(url, () => {});

  const { rotatePersonalKey } = await import('@/server/auth/door');
  const { asSystem } = await import('@/server/db/system');
  const { closeDb } = await import('@/server/db/client');
  const people = [
    ['owner', 'deneme sahibi', 'sahip@example.test', true],
    ['editor', 'deneme editör', 'editor@example.test', true],
    ['member', 'deneme üye', 'uye@example.test', true],
    ['member', 'davetsiz üye', 'davetsiz@example.test', false],
  ] as const;
  const out: Record<string, { id: string; key: string; name: string }> = {};
  for (const [role, name, email, invited] of people) {
    const id = await asSystem(async (tx) => {
      const [m] = await tx<{ id: string }[]>`
        insert into members (display_name, email, role, status, activated_at) values (${name}, ${email}, ${role}, 'active', now())
        returning id`;
      if (invited)
        await tx`insert into event_invitees (event_id, member_id) select id, ${m!.id} from events where number = 2`;
      return m!.id;
    });
    const key = await rotatePersonalKey(id);
    out[invited ? role : 'outsider'] = { id, key, name };
  }
  await closeDb();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/e2e-state.json', JSON.stringify(out, null, 2));
  console.log('e2e database ready');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
