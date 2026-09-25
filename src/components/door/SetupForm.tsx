'use client';

import Link from 'next/link';
import { useActionState, useId } from 'react';
import { setupAction, type SetupState } from '@/server/actions/setup';
import ui from '@/components/ui/ui.module.css';
import styles from './Door.module.css';

const initial: SetupState = { code: null, message: null };

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, initial);
  const id = useId();
  if (state.code) {
    return (
      <div className={styles.form}>
        <p className={styles.copy}>tek kullanımlık giriş kodun (14 gün geçerli):</p>
        <output className={ui.code}>{state.code}</output>
        <p className={styles.copy}>
          kodu şimdi kapıya gir, kendi kişisel anahtarını oluştur, ardından masa → güvenlik’ten
          ikinci doğrulamayı kur. son olarak barındırmadaki SETUP_TOKEN değerini sil.
        </p>
        <p className={styles.aside}>
          <Link href="/">kapıya git</Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className={styles.form} data-pending={pending || undefined}>
      <label htmlFor={`${id}-token`} className={styles.label}>
        kurulum anahtarı
      </label>
      <div className={styles.field}>
        <input
          id={`${id}-token`}
          name="token"
          type="password"
          className={styles.emailInput}
          autoComplete="off"
          required
          maxLength={200}
          disabled={pending}
        />
      </div>
      <label htmlFor={`${id}-name`} className={styles.label}>
        adın
      </label>
      <div className={styles.field}>
        <input
          id={`${id}-name`}
          name="name"
          className={styles.emailInput}
          autoComplete="name"
          required
          maxLength={80}
          disabled={pending}
        />
      </div>
      <p className={styles.message} role="status" aria-live="polite">
        {state.message}
      </p>
      <button type="submit" className={styles.enter} disabled={pending}>
        {pending ? 'bekle' : 'kurucuyu oluştur'}
      </button>
    </form>
  );
}
