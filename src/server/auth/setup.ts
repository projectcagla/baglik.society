import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { asSystem } from '@/server/db/system';
import { issueInvite } from './door';
import { ipBucket, isLimited, record } from './rate-limit';

// First-owner setup from the browser, for installations where nobody runs
// scripts against the production database. Available only while a
// SETUP_TOKEN is configured AND no owner exists; the first success closes it
// for good. The result is the same one-time invite code `owner:create` prints.

async function ownerExists(): Promise<boolean> {
  const rows = await asSystem(
    (tx) => tx`select 1 from members where role = 'owner' and status <> 'revoked' limit 1`,
  );
  return rows.length > 0;
}

/** Read at call time (not cached): removing the variable closes setup at once. */
function setupToken(): string | null {
  const t = process.env.SETUP_TOKEN ?? '';
  return t.length >= 32 ? t : null;
}

export async function setupAvailable(): Promise<boolean> {
  return !!setupToken() && !(await ownerExists());
}

function tokenMatches(given: string): boolean {
  const expected = setupToken();
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SetupResult =
  { kind: 'ok'; code: string } | { kind: 'closed' } | { kind: 'denied' } | { kind: 'throttled' };

export async function bootstrapOwner(
  token: string,
  name: string,
  ip: string | null,
): Promise<SetupResult> {
  const bucket = `setup:${ipBucket(ip)}`;
  const memberId = await asSystem(async (tx): Promise<SetupResult | string> => {
    // one setup at a time; the second caller sees the owner the first created
    await tx`select pg_advisory_xact_lock(hashtext('baglik:setup'))`;
    if (await isLimited(tx, bucket, 'setup')) return { kind: 'throttled' };
    if (!setupToken()) return { kind: 'closed' };
    const [owner] =
      await tx`select 1 from members where role = 'owner' and status <> 'revoked' limit 1`;
    if (owner) return { kind: 'closed' };
    if (!tokenMatches(token)) {
      await record(tx, [bucket], false);
      return { kind: 'denied' };
    }
    await record(tx, [bucket], true);
    const [m] = await tx<{ id: string }[]>`
      insert into members (display_name, role, status) values (${name}, 'owner', 'invited') returning id`;
    await tx`insert into audit_logs (action, target_type, target_id, meta)
             values ('member.create', 'member', ${m!.id}, ${tx.json({ via: 'setup', role: 'owner' })})`;
    return m!.id;
  });
  if (typeof memberId !== 'string') return memberId;
  return { kind: 'ok', code: await issueInvite(memberId, null) };
}
