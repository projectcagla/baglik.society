'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RETURN_COOKIE } from '@/lib/session-cookie';
import { safeReturnPath } from '@/lib/return-path';
import { enterWithCode } from '@/server/auth/door';
import { readSessionToken, revokeSessionByToken, setSessionCookie } from '@/server/auth/session';
import { requestContext } from '@/server/auth/viewer';

export interface DoorState {
  message: string | null;
}

export async function enterAction(_prev: DoorState, form: FormData): Promise<DoorState> {
  const code = String(form.get('code') ?? '');
  if (!code.trim()) return { message: 'giriş kodunu yaz.' };

  const result = await enterWithCode(code, await requestContext());
  if (!result.ok) {
    return {
      message:
        result.reason === 'throttled'
          ? 'çok fazla deneme yapıldı. birkaç dakika sonra yeniden dene.'
          : 'kod geçerli değil.',
    };
  }

  // session fixation: any previous session on this browser ends here
  const previous = await readSessionToken();
  if (previous) await revokeSessionByToken(previous);
  await setSessionCookie(result.token);

  const jar = await cookies();
  const back = safeReturnPath(jar.get(RETURN_COOKIE)?.value);
  jar.delete(RETURN_COOKIE);

  redirect(result.kind === 'key' ? (back ?? '/oda') : '/hosgeldin');
}
