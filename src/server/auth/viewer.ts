import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import type { DbActor } from '@/server/db/context';
import { isMfaFresh, readSessionToken, resolveSession } from './session';

export type Role = 'owner' | 'admin' | 'editor' | 'member';

export interface Viewer {
  id: string;
  sessionId: string;
  displayName: string;
  email: string | null;
  role: Role;
  isStaff: boolean;
  isAdmin: boolean;
  /** admin second factor verified on this session within MFA_FRESH_HOURS */
  mfaFresh: boolean;
  privacyAcknowledged: boolean;
}

/** Resolved once per request; null for anyone without a live session. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const s = await resolveSession(token);
  if (!s) return null;
  const isAdmin = s.role === 'owner' || s.role === 'admin';
  return {
    id: s.member_id,
    sessionId: s.session_id,
    displayName: s.display_name,
    email: s.email,
    role: s.role,
    isStaff: isAdmin || s.role === 'editor',
    isAdmin,
    mfaFresh: isAdmin && isMfaFresh(s.mfa_verified_at),
    privacyAcknowledged: !!s.privacy_ack_at,
  };
});

/** The identity handed to Postgres for row level security. */
export function actorOf(v: Viewer, opts: { preview?: boolean } = {}): DbActor {
  return { memberId: v.id, mfa: v.mfaFresh, preview: !!opts.preview && v.isStaff };
}

export async function currentPath(): Promise<string> {
  return (await headers()).get('x-bs-path') ?? '/oda';
}

export async function requireMember(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect('/');
  return v;
}

export async function requireStaff(): Promise<Viewer> {
  const v = await requireMember();
  if (!v.isStaff) forbidden();
  return v;
}

/** Owner/admin with a fresh second factor; otherwise to the step-up page. */
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireMember();
  if (!v.isAdmin) forbidden();
  if (!v.mfaFresh) redirect(`/masa/guvenlik?r=${encodeURIComponent(await currentPath())}`);
  return v;
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  // Vercel and most reverse proxies overwrite x-real-ip; prefer it over the
  // client-appendable x-forwarded-for chain.
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return { ip: h.get('x-real-ip') || forwarded || null, userAgent: h.get('user-agent') };
}
