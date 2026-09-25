'use client';

import { useActionState, useState } from 'react';
import { createKeyAction, type KeyState } from '@/server/actions/member';
import ui from '@/components/ui/ui.module.css';

const initial: KeyState = { code: null, message: null };

/**
 * Shows a newly created personal key exactly once. The form around the
 * revealed key has username + new-password fields so browser password
 * managers offer to save it.
 */
export function KeyCreator({
  hasKey,
  account,
  next,
}: {
  hasKey: boolean;
  account: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState(createKeyAction, initial);
  const [copied, setCopied] = useState(false);

  if (state.code) {
    return (
      <form
        className={ui.field}
        action={next ?? '/oda'}
        method="get"
        onSubmit={() => {
          /* navigation only; lets the password manager capture the key */
        }}
      >
        <p className={ui.label}>kişisel anahtarın — yalnızca şimdi gösteriliyor:</p>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={account}
          readOnly
          hidden
        />
        <output className={ui.code} aria-live="polite">
          {state.code}
        </output>
        <input
          type="password"
          name="bs_key"
          autoComplete="new-password"
          value={state.code}
          readOnly
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className={ui.row}>
          <button
            type="button"
            className={ui.button}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.code!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'kopyalandı' : 'kopyala'}
          </button>
          <button type="submit" className={`${ui.button} ${ui.primary}`}>
            sakladım, devam
          </button>
        </div>
        <p className={ui.hint}>
          bir parola yöneticisine ya da güvendiğin bir yere kaydet. bu anahtar yeniden gösterilmez;
          kaybedersen yenisini oluşturabilir ya da e-postanla tek kullanımlık kod isteyebilirsin.
        </p>
      </form>
    );
  }

  return (
    <form action={action} className={ui.field}>
      {hasKey && (
        <label className={ui.check}>
          <input type="checkbox" name="confirm" value="1" required /> eski anahtarım geçersiz olsun
        </label>
      )}
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : hasKey ? 'yeni anahtar oluştur' : 'anahtarımı oluştur'}
        </button>
      </div>
      {state.message && (
        <p className={`${ui.status} ${ui.statusBad}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
