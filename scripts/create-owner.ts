// Creates the first owner and prints a one-time invite code (valid 14 days).
//   npm run owner:create -- --name "Çağla Aytaç Dursun" --email ornek@alan.com
// Run once per deployment. Codes are shown here only; they are stored hashed.
import { parseArgs } from 'node:util';
import { issueInvite, INVITE_TTL_DAYS } from '@/server/auth/door';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';

const { values } = parseArgs({ options: { name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', default: 'owner' } } });

async function main() {
  const name = values.name?.trim();
  if (!name) throw new Error('--name is required');
  const role = values.role === 'admin' ? 'admin' : 'owner';
  const member = await asSystem(async (tx) => {
    const existing = values.email
      ? await tx<{ id: string }[]>`select id from members where lower(email) = lower(${values.email})`
      : [];
    if (existing[0]) return existing[0];
    const [m] = await tx<{ id: string }[]>`
      insert into members (display_name, email, role, status) values (${name}, ${values.email ?? null}, ${role}, 'invited')
      returning id`;
    await tx`insert into audit_logs (action, target_type, target_id, meta)
             values ('member.create', 'member', ${m!.id}, ${tx.json({ via: 'cli', role })})`;
    return m!;
  });
  const code = await issueInvite(member.id, null);
  console.log(`\n${role}: ${name}`);
  console.log(`tek kullanımlık davet kodu (${INVITE_TTL_DAYS} gün): ${code}`);
  console.log('Bu kodu yalnızca ilgili kişiye, özel bir kanaldan ilet. Tekrar gösterilmez.\n');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
