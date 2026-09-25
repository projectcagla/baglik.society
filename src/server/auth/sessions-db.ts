import 'server-only';
import { asSystem } from '@/server/db/system';
import type { Tx } from '@/server/db/context';
import { randomToken, sha256 } from './crypto';

export const IDLE_DAYS = 30;
export const ABSOLUTE_DAYS = 180;
/** An admin's second factor is trusted for this long on one session. */
export const MFA_FRESH_HOURS = 12;

export interface SessionRow {
  session_id: string;
  member_id: string;
  display_name: string;
  email: string | null;
  role: 'owner' | 'admin' | 'editor' | 'member';
  mfa_verified_at: Date | null;
  last_used_at: Date;
  privacy_ack_at: Date | null;
}

/** Coarse, human-recognisable device label; the raw UA string is not kept. */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'bilinmeyen cihaz';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'cihaz';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'tarayıcı';
  return `${device} · ${browser}`;
}

/** Creates a session row and returns the raw token (only ever sent as a cookie). */
export async function createSession(
  tx: Tx,
  memberId: string,
  userAgent: string | null,
  opts: { mfa?: boolean } = {},
): Promise<string> {
  const token = randomToken(32);
  await tx`
    insert into private.sessions (member_id, token_hash, idle_expires_at, expires_at, user_agent, mfa_verified_at)
    values (${memberId}, ${sha256(token)},
            now() + make_interval(days => ${IDLE_DAYS}),
            now() + make_interval(days => ${ABSOLUTE_DAYS}),
            ${summarizeUserAgent(userAgent)},
            ${opts.mfa ? new Date() : null})`;
  return token;
}

/** Resolves a raw token to a live session of an active member, or null. */
export async function resolveSession(token: string): Promise<SessionRow | null> {
  return asSystem(async (tx) => {
    const rows = await tx<SessionRow[]>`
      select s.id as session_id, s.member_id, m.display_name, m.email, m.role,
             s.mfa_verified_at, s.last_used_at, m.privacy_ack_at
        from private.sessions s
        join members m on m.id = s.member_id
       where s.token_hash = ${sha256(token)}
         and s.revoked_at is null
         and s.expires_at > now()
         and s.idle_expires_at > now()
         and m.status = 'active'`;
    const row = rows[0];
    if (!row) return null;
    // sliding idle expiry, written at most once an hour
    if (Date.now() - row.last_used_at.getTime() > 60 * 60 * 1000) {
      await tx`
        update private.sessions
           set last_used_at = now(),
               idle_expires_at = least(expires_at, now() + make_interval(days => ${IDLE_DAYS}))
         where id = ${row.session_id}`;
    }
    return row;
  });
}

export function isMfaFresh(verifiedAt: Date | null): boolean {
  return !!verifiedAt && Date.now() - verifiedAt.getTime() < MFA_FRESH_HOURS * 3600 * 1000;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await asSystem((tx) => tx`update private.sessions set revoked_at = now() where token_hash = ${sha256(token)} and revoked_at is null`);
}

export async function revokeAllSessions(tx: Tx, memberId: string, exceptSessionId?: string): Promise<number> {
  const rows = exceptSessionId
    ? await tx`update private.sessions set revoked_at = now()
                where member_id = ${memberId} and revoked_at is null and id <> ${exceptSessionId} returning id`
    : await tx`update private.sessions set revoked_at = now()
                where member_id = ${memberId} and revoked_at is null returning id`;
  return rows.length;
}

export interface SessionListItem {
  id: string;
  created_at: Date;
  last_used_at: Date;
  user_agent: string | null;
}

export async function listSessions(memberId: string): Promise<SessionListItem[]> {
  return asSystem(
    (tx) => tx<SessionListItem[]>`
      select id, created_at, last_used_at, user_agent from private.sessions
       where member_id = ${memberId} and revoked_at is null and expires_at > now() and idle_expires_at > now()
       order by last_used_at desc`,
  );
}

export async function revokeOwnSession(memberId: string, sessionId: string): Promise<void> {
  await asSystem(
    (tx) => tx`update private.sessions set revoked_at = now() where id = ${sessionId} and member_id = ${memberId}`,
  );
}

export async function markSessionMfa(sessionId: string): Promise<void> {
  await asSystem((tx) => tx`update private.sessions set mfa_verified_at = now() where id = ${sessionId}`);
}
