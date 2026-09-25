import 'server-only';
import { newTotpSecret, otpauthUri, verifyTotp } from '@/lib/totp';
import { asSystem } from '@/server/db/system';
import { decrypt, encrypt } from './crypto';
import { isLimited, record } from './rate-limit';
import { markSessionMfa } from './sessions-db';

export interface MfaStatus {
  enrolled: boolean;
  pendingSecret: string | null;
}

export async function mfaStatus(memberId: string): Promise<MfaStatus> {
  const [row] = await asSystem(
    (tx) => tx<{ secret_enc: string; enabled_at: Date | null }[]>`
      select secret_enc, enabled_at from private.member_mfa where member_id = ${memberId}`,
  );
  if (!row) return { enrolled: false, pendingSecret: null };
  return { enrolled: !!row.enabled_at, pendingSecret: row.enabled_at ? null : decrypt(row.secret_enc) };
}

/** Starts (or restarts) enrolment. Returns the secret + otpauth URI to show once. */
export async function beginEnrollment(memberId: string, account: string): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret();
  await asSystem(async (tx) => {
    const [existing] = await tx<{ enabled_at: Date | null }[]>`
      select enabled_at from private.member_mfa where member_id = ${memberId}`;
    if (existing?.enabled_at) throw new Error('already enrolled');
    await tx`
      insert into private.member_mfa (member_id, secret_enc) values (${memberId}, ${encrypt(secret)})
      on conflict (member_id) do update set secret_enc = excluded.secret_enc, last_step = null, created_at = now()`;
  });
  return { secret, uri: otpauthUri(secret, account) };
}

export type MfaCheck = 'ok' | 'invalid' | 'throttled';

/**
 * Checks a 6-digit code (enrolment confirmation or step-up). Replays of an
 * already accepted time step are refused. On success the session is marked.
 */
export async function verifyMfa(memberId: string, sessionId: string, code: string): Promise<MfaCheck> {
  const bucket = `mfa:${memberId}`;
  const outcome = await asSystem(async (tx): Promise<MfaCheck> => {
    if (await isLimited(tx, bucket, 'mfa')) return 'throttled';
    const [row] = await tx<{ secret_enc: string; enabled_at: Date | null; last_step: string | null }[]>`
      select secret_enc, enabled_at, last_step from private.member_mfa where member_id = ${memberId} for update`;
    if (!row) return 'invalid';
    const step = verifyTotp(decrypt(row.secret_enc), code);
    if (step === null || (row.last_step !== null && step <= Number(row.last_step))) {
      await record(tx, [bucket], false);
      return 'invalid';
    }
    await tx`update private.member_mfa set last_step = ${step}, enabled_at = coalesce(enabled_at, now())
              where member_id = ${memberId}`;
    await record(tx, [bucket], true);
    await tx`insert into audit_logs (actor_id, action, target_type, target_id)
             values (${memberId}, ${row.enabled_at ? 'mfa.verify' : 'mfa.enroll'}, 'member', ${memberId})`;
    return 'ok';
  });
  if (outcome === 'ok') await markSessionMfa(sessionId);
  return outcome;
}

/** Owner-only reset of someone else's second factor (e.g. lost phone). */
export async function resetMfa(memberId: string, actorId: string): Promise<void> {
  await asSystem(async (tx) => {
    const [actor] = await tx<{ role: string }[]>`select role from members where id = ${actorId} and status = 'active'`;
    if (actor?.role !== 'owner' || actorId === memberId) throw new Error('not allowed');
    await tx`delete from private.member_mfa where member_id = ${memberId}`;
    await tx`update private.sessions set mfa_verified_at = null where member_id = ${memberId}`;
    await tx`insert into audit_logs (actor_id, action, target_type, target_id) values (${actorId}, 'mfa.reset', 'member', ${memberId})`;
  });
}
