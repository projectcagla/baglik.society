import 'server-only';
import { formatCode, generateCode, normalizeCode } from '@/lib/codes';
import { asSystem } from '@/server/db/system';
import type { Tx } from '@/server/db/context';
import { burnVerify, checkVerifier, hashVerifier } from './hash';
import { ipBucket, isLimited, pruneAttempts, record } from './rate-limit';
import { createSession, revokeAllSessions } from './sessions-db';
import { pepperHmac } from './crypto';

export type DoorResult =
  | { ok: true; token: string; memberId: string; kind: 'key' | 'invite' | 'recovery' }
  | { ok: false; reason: 'invalid' | 'throttled' };

interface CredentialRow {
  id: string;
  member_id: string;
  kind: 'key' | 'invite' | 'recovery';
  verifier_hash: string;
  expires_at: Date | null;
  used_at: Date | null;
  member_status: 'invited' | 'active' | 'revoked';
}

async function audit(tx: Tx, actor: string | null, action: string, meta: Record<string, unknown>, ip?: string) {
  await tx`insert into audit_logs (actor_id, action, target_type, target_id, meta, ip_hash)
           values (${actor}, ${action}, 'member', ${actor}, ${tx.json(meta as never)}, ${ip ?? null})`;
}

/**
 * The single door field. Same answer, same work (one Argon2id check) for
 * every failure: unknown code, wrong code, expired/used invite, revoked
 * member, locked selector. Nothing reveals which of those it was.
 */
export async function enterWithCode(
  input: string,
  ctx: { ip: string | null; userAgent: string | null },
): Promise<DoorResult> {
  const parsed = normalizeCode(input);
  const ipKey = ipBucket(ctx.ip);

  const throttled = await asSystem(async (tx) => {
    if (Math.random() < 0.02) await pruneAttempts(tx);
    return (await isLimited(tx, 'global', 'global')) || (await isLimited(tx, ipKey, 'ip'));
  });
  if (throttled) return { ok: false, reason: 'throttled' };

  if (!parsed) {
    await burnVerify('x'.repeat(12));
    await asSystem((tx) => record(tx, [ipKey, 'global'], false));
    return { ok: false, reason: 'invalid' };
  }

  const selKey = `sel:${parsed.selector}`;
  const cred = await asSystem(async (tx) => {
    const rows = await tx<CredentialRow[]>`
      select c.id, c.member_id, c.kind, c.verifier_hash, c.expires_at, c.used_at, m.status as member_status
        from private.credentials c join members m on m.id = c.member_id
       where c.selector = ${parsed.selector} and c.revoked_at is null`;
    const row = rows[0] ?? null;
    const locked = await isLimited(tx, selKey, 'selector');
    return locked ? null : row;
  });

  const usable =
    !!cred &&
    cred.member_status !== 'revoked' &&
    (cred.expires_at === null || cred.expires_at.getTime() > Date.now()) &&
    (cred.kind === 'key' || cred.used_at === null);

  const verified = cred ? await checkVerifier(cred.verifier_hash, parsed.verifier) : (await burnVerify(parsed.verifier), false);

  if (!cred || !usable || !verified) {
    await asSystem(async (tx) => {
      await record(tx, [ipKey, selKey, 'global'], false);
      await audit(tx, null, 'auth.fail', {}, ipKey);
    });
    return { ok: false, reason: 'invalid' };
  }

  return asSystem(async (tx) => {
    if (cred.kind !== 'key') {
      // one-time: consume atomically so two tabs cannot both use it
      const consumed = await tx`update private.credentials set used_at = now()
                                 where id = ${cred.id} and used_at is null returning id`;
      if (!consumed.length) return { ok: false, reason: 'invalid' } as const;
    }
    if (cred.member_status === 'invited') {
      await tx`update members set status = 'active', activated_at = now() where id = ${cred.member_id}`;
    }
    await record(tx, [ipKey], true);
    const token = await createSession(tx, cred.member_id, ctx.userAgent);
    await audit(tx, cred.member_id, 'auth.login', { via: cred.kind }, ipKey);
    return { ok: true, token, memberId: cred.member_id, kind: cred.kind } as const;
  });
}

async function insertCredential(
  tx: Tx,
  memberId: string,
  kind: 'key' | 'invite' | 'recovery',
  ttlMinutes: number | null,
  createdBy: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { code, selector, verifier } = generateCode();
    const clash = await tx`select 1 from private.credentials where selector = ${selector}`;
    if (clash.length) continue;
    await tx`
      insert into private.credentials (member_id, kind, selector, verifier_hash, expires_at, created_by)
      values (${memberId}, ${kind}, ${selector}, ${await hashVerifier(verifier)},
              ${ttlMinutes === null ? null : tx`now() + make_interval(mins => ${ttlMinutes})`}, ${createdBy})`;
    return code;
  }
  throw new Error('could not allocate a unique selector');
}

/** Member creates (or replaces) their personal key. Old keys stop working. */
export async function rotatePersonalKey(memberId: string): Promise<string> {
  return asSystem(async (tx) => {
    await tx`update private.credentials set revoked_at = now()
              where member_id = ${memberId} and kind = 'key' and revoked_at is null`;
    const code = await insertCredential(tx, memberId, 'key', null, memberId);
    await audit(tx, memberId, 'key.rotate', {});
    return code;
  });
}

export async function hasPersonalKey(memberId: string): Promise<boolean> {
  const rows = await asSystem(
    (tx) => tx`select 1 from private.credentials where member_id = ${memberId} and kind = 'key' and revoked_at is null`,
  );
  return rows.length > 0;
}

async function assertAdmin(tx: Tx, actorId: string) {
  const rows = await tx`select 1 from members where id = ${actorId} and status = 'active' and role in ('owner', 'admin')`;
  if (!rows.length) throw new Error('not allowed');
}

export const INVITE_TTL_DAYS = 14;

/**
 * One-time invite for a member, shown once to the admin who sends it
 * privately. Any earlier unused invite for the same member is revoked.
 * Callers must have checked admin + MFA; this re-checks the role in SQL.
 */
export async function issueInvite(memberId: string, actorId: string | null): Promise<string> {
  return asSystem(async (tx) => {
    if (actorId) await assertAdmin(tx, actorId);
    const [m] = await tx<{ status: string }[]>`select status from members where id = ${memberId}`;
    if (!m || m.status === 'revoked') throw new Error('member not available');
    await tx`update private.credentials set revoked_at = now()
              where member_id = ${memberId} and kind in ('invite', 'recovery') and used_at is null and revoked_at is null`;
    const code = await insertCredential(tx, memberId, 'invite', INVITE_TTL_DAYS * 24 * 60, actorId);
    await tx`insert into audit_logs (actor_id, action, target_type, target_id) values (${actorId}, 'invite.issue', 'member', ${memberId})`;
    return code;
  });
}

export interface CredentialSummary {
  kind: 'key' | 'invite' | 'recovery';
  created_at: Date;
  expires_at: Date | null;
  used_at: Date | null;
  revoked_at: Date | null;
}

/** For the admin member page; never includes hashes or selectors. */
export async function credentialSummary(memberId: string): Promise<CredentialSummary[]> {
  return asSystem(
    (tx) => tx<CredentialSummary[]>`
      select kind, created_at, expires_at, used_at, revoked_at from private.credentials
       where member_id = ${memberId} order by created_at desc limit 12`,
  );
}

/** Revokes a member completely: status, every credential, every session. */
export async function revokeMember(memberId: string, actorId: string): Promise<void> {
  await asSystem(async (tx) => {
    await assertAdmin(tx, actorId);
    const [target] = await tx<{ role: string }[]>`select role from members where id = ${memberId}`;
    const [actor] = await tx<{ role: string }[]>`select role from members where id = ${actorId}`;
    if (!target) throw new Error('not found');
    if (memberId === actorId) throw new Error('cannot revoke yourself');
    if ((target.role === 'owner' || target.role === 'admin') && actor?.role !== 'owner') throw new Error('not allowed');
    await tx`update members set status = 'revoked', revoked_at = now() where id = ${memberId}`;
    await tx`update private.credentials set revoked_at = now() where member_id = ${memberId} and revoked_at is null`;
    await revokeAllSessions(tx, memberId);
    await tx`insert into audit_logs (actor_id, action, target_type, target_id) values (${actorId}, 'member.revoke', 'member', ${memberId})`;
  });
}

export async function restoreMember(memberId: string, actorId: string): Promise<void> {
  await asSystem(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx`update members set status = 'invited', revoked_at = null where id = ${memberId} and status = 'revoked'`;
    await tx`insert into audit_logs (actor_id, action, target_type, target_id) values (${actorId}, 'member.restore', 'member', ${memberId})`;
  });
}

export async function endAllSessionsFor(memberId: string, actorId: string, keepSessionId?: string): Promise<number> {
  return asSystem(async (tx) => {
    if (actorId !== memberId) await assertAdmin(tx, actorId);
    const n = await revokeAllSessions(tx, memberId, keepSessionId);
    await tx`insert into audit_logs (actor_id, action, target_type, target_id, meta)
             values (${actorId}, 'sessions.end_all', 'member', ${memberId}, ${tx.json({ count: n })})`;
    return n;
  });
}

// ─── recovery ("anahtarımı kaybettim") ─────────────────────────────────────
export const RECOVERY_TTL_MIN = 30;

export type RecoveryOutcome =
  | { kind: 'none' }
  | { kind: 'throttled' }
  | { kind: 'issued'; memberId: string; email: string; code: string };

/**
 * Always answered with the same sentence by the caller. Issues a one-time,
 * 30-minute code only when the address belongs to an active member.
 */
export async function requestRecovery(email: string, ip: string | null): Promise<RecoveryOutcome> {
  const normalized = email.trim().toLowerCase();
  const ipKey = `rec-${ipBucket(ip)}`;
  const emailKey = `rec-mail:${pepperHmac(`mail:${normalized}`).slice(0, 24)}`;
  return asSystem(async (tx) => {
    if ((await isLimited(tx, ipKey, 'recoveryIp')) || (await isLimited(tx, emailKey, 'recoveryEmail'))) {
      return { kind: 'throttled' } as const;
    }
    // every request counts against the budget, found or not
    await record(tx, [ipKey, emailKey], false);
    const [m] = await tx<{ id: string; email: string }[]>`
      select id, email from members where lower(email) = ${normalized} and status = 'active'`;
    if (!m) return { kind: 'none' } as const;
    await tx`update private.credentials set revoked_at = now()
              where member_id = ${m.id} and kind = 'recovery' and used_at is null and revoked_at is null`;
    const code = await insertCredential(tx, m.id, 'recovery', RECOVERY_TTL_MIN, null);
    await tx`insert into audit_logs (actor_id, action, target_type, target_id) values (null, 'recovery.issue', 'member', ${m.id})`;
    return { kind: 'issued', memberId: m.id, email: m.email, code } as const;
  });
}

export { formatCode };
