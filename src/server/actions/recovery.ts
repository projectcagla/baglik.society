'use server';

import { z } from 'zod';
import { requestRecovery, RECOVERY_TTL_MIN } from '@/server/auth/door';
import { requestContext } from '@/server/auth/viewer';
import { deliver } from '@/server/system/mail';
import { env } from '@/server/env';

export interface RecoveryState {
  done: boolean;
  message: string | null;
}

const SAME_ANSWER =
  'istek alındı. adres bir üyeye aitse, yarım saat geçerli tek kullanımlık bir giriş kodu gönderilecek.';

export async function recoveryAction(_prev: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = z.string().trim().email().max(200).safeParse(form.get('email'));
  if (!email.success) return { done: false, message: 'geçerli bir e-posta adresi yaz.' };

  const outcome = await requestRecovery(email.data, (await requestContext()).ip);
  if (outcome.kind === 'throttled') {
    return { done: false, message: 'çok fazla istek yapıldı. daha sonra yeniden dene.' };
  }
  if (outcome.kind === 'issued') {
    const origin = env().APP_ORIGIN ?? '';
    await deliver({
      to: outcome.email,
      kind: 'kurtarma_kodu',
      memberId: outcome.memberId,
      subject: 'bağlık.society · giriş kodu',
      text:
        `tek kullanımlık giriş kodun:\n\n${outcome.code}\n\n` +
        `${RECOVERY_TTL_MIN} dakika geçerlidir. ${origin || 'siteye'} girip kapıdaki alana yaz; ` +
        `ardından yeni kişisel anahtarını oluştur.\n\nbu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    });
  }
  // identical answer whether or not the address exists
  return { done: true, message: SAME_ANSWER };
}
