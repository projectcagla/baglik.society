'use server';

import { z } from 'zod';
import { bootstrapOwner } from '@/server/auth/setup';
import { requestContext } from '@/server/auth/viewer';

export interface SetupState {
  code: string | null;
  message: string | null;
}

export async function setupAction(_prev: SetupState, form: FormData): Promise<SetupState> {
  const parsed = z
    .object({ token: z.string().min(1).max(200), name: z.string().trim().min(1).max(80) })
    .safeParse({ token: form.get('token'), name: form.get('name') });
  if (!parsed.success) return { code: null, message: 'kurulum anahtarını ve adını yaz.' };
  const res = await bootstrapOwner(
    parsed.data.token,
    parsed.data.name,
    (await requestContext()).ip,
  );
  switch (res.kind) {
    case 'ok':
      return { code: res.code, message: null };
    case 'throttled':
      return { code: null, message: 'çok fazla deneme. bir saat sonra yeniden dene.' };
    case 'closed':
      return { code: null, message: 'kurulum kapalı.' };
    default:
      return { code: null, message: 'kurulum anahtarı doğru değil.' };
  }
}
