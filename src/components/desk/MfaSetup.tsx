'use client';

import { useActionState, useState, useTransition } from 'react';
import { startMfaAction, verifyMfaAction, type MfaState } from '@/server/actions/desk';
import ui from '@/components/ui/ui.module.css';
import styles from './Desk.module.css';

const initial: MfaState = { message: null };

export function MfaSetup({ enrolled, returnTo }: { enrolled: boolean; returnTo: string }) {
  const [setup, setSetup] = useState<MfaState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(verifyMfaAction, initial);

  return (
    <div className={styles.grid}>
      {!enrolled && !setup?.secret && (
        <div className={styles.grid}>
          <p>bir doğrulama uygulamasıyla (ör. 1password, google authenticator, aegis) kurulum yap.</p>
          <p>
            <button
              type="button"
              className={`${ui.button} ${ui.primary}`}
              disabled={starting}
              onClick={() => startTransition(async () => setSetup(await startMfaAction()))}
            >
              {starting ? 'bekle' : 'kurulumu başlat'}
            </button>
          </p>
          {setup?.message && <p className={`${ui.status} ${ui.statusBad}`}>{setup.message}</p>}
        </div>
      )}
      {setup?.secret && (
        <div className={styles.cols2}>
          {setup.qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={setup.qr} alt="doğrulama uygulaması için karekod" width={240} height={240} />
          )}
          <div className={styles.grid}>
            <p className={ui.label}>karekodu okutamıyorsan bu anahtarı elle gir:</p>
            <code className={ui.code}>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
          </div>
        </div>
      )}
      {(enrolled || setup?.secret) && (
        <form action={action} className={styles.grid}>
          <input type="hidden" name="r" value={returnTo} />
          <div className={ui.field}>
            <label htmlFor="mfa-code" className={ui.label}>
              uygulamadaki 6 haneli kod
            </label>
            <input
              id="mfa-code"
              name="code"
              className={ui.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              style={{ maxWidth: '12rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.2em' }}
            />
          </div>
          <div className={ui.row}>
            <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
              {pending ? 'bekle' : 'doğrula'}
            </button>
            {state.message && <p className={`${ui.status} ${ui.statusBad}`}>{state.message}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
