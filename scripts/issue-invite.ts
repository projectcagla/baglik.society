// Issues a fresh one-time invite code for an existing member (e.g. lost key
// and no e-mail provider configured).  npm run invite:issue -- --email x@y.z
import { parseArgs } from 'node:util';
import { issueInvite } from '@/server/auth/door';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';

const { values } = parseArgs({ options: { email: { type: 'string' } } });

async function main() {
  if (!values.email) throw new Error('--email is required');
  const [m] = await asSystem(
    (tx) => tx<{ id: string; display_name: string }[]>`
    select id, display_name from members where lower(email) = lower(${values.email!}) and status <> 'revoked'`,
  );
  if (!m) throw new Error('no active member with that e-mail');
  const code = await issueInvite(m.id, null);
  console.log(`${m.display_name}: ${code}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
