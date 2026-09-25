// Removes the second factor of an owner/admin who lost their authenticator.
// Requires direct database access, which is the point.  npm run mfa:reset -- --email x@y.z
import { parseArgs } from 'node:util';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';

const { values } = parseArgs({ options: { email: { type: 'string' } } });

async function main() {
  if (!values.email) throw new Error('--email is required');
  await asSystem(async (tx) => {
    const [m] = await tx<
      { id: string }[]
    >`select id from members where lower(email) = lower(${values.email!})`;
    if (!m) throw new Error('not found');
    await tx`delete from private.member_mfa where member_id = ${m.id}`;
    await tx`update private.sessions set mfa_verified_at = null where member_id = ${m.id}`;
    await tx`insert into audit_logs (action, target_type, target_id, meta) values ('mfa.reset', 'member', ${m.id}, ${tx.json({ via: 'cli' })})`;
  });
  console.log('second factor removed; enrol again at /masa/guvenlik');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
