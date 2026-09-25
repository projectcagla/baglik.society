// DEVELOPMENT ONLY. Adds clearly labelled demo members, invites them to film
// night 002 and prints a personal key for each. Refuses to run in production.
import { rotatePersonalKey } from '@/server/auth/door';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';

const DEMO = [
  { name: 'deneme sahibi', email: 'sahip@example.test', role: 'owner' },
  { name: 'deneme editör', email: 'editor@example.test', role: 'editor' },
  { name: 'deneme üye', email: 'uye@example.test', role: 'member' },
  { name: 'davetsiz üye', email: 'davetsiz@example.test', role: 'member' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('seed-demo refuses to run in production');
  }
  for (const d of DEMO) {
    const id = await asSystem(async (tx) => {
      const [m] = await tx<{ id: string }[]>`
        insert into members (display_name, email, role, status, activated_at)
        values (${d.name}, ${d.email}, ${d.role}, 'active', now())
        on conflict ((lower(email))) where email is not null do update set display_name = excluded.display_name
        returning id`;
      if (d.name !== 'davetsiz üye') {
        await tx`insert into event_invitees (event_id, member_id)
                 select id, ${m!.id} from events where number = 2
                 on conflict do nothing`;
      }
      return m!.id;
    });
    const key = await rotatePersonalKey(id);
    console.log(`${d.role.padEnd(7)} ${d.name.padEnd(14)} ${key}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
