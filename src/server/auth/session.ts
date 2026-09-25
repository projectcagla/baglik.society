import 'server-only';
import { cookies } from 'next/headers';
import { isProduction } from '@/server/env';
import { SESSION_COOKIE, SESSION_MAX_AGE_S } from '@/lib/session-cookie';

export * from './sessions-db';

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction() && process.env.INSECURE_COOKIES !== '1',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
    priority: 'high',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && value.length >= 40 && value.length <= 64 ? value : null;
}

