'use client';

import { useActionState, useId } from 'react';
import { recoveryAction, type RecoveryState } from '@/server/actions/recovery';
import styles from './Door.module.css';

const initial: RecoveryState = { done: false, message: null };

export function RecoveryForm() {
  const [state, action, pending] = useActionState(recoveryAction, initial);
  const id = useId();
  if (state.done) {
    return (
      <p className={styles.copy} role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className={styles.form} data-pending={pending || undefined}>
      <label htmlFor={`${id}-email`} className={styles.label}>
        e-posta
      </label>
      <div className={styles.field}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          className={styles.emailInput}
          autoComplete="email"
          inputMode="email"
          required
          maxLength={200}
          disabled={pending}
        />
      </div>
      <p className={styles.message} role="status" aria-live="polite">
        {state.message}
      </p>
      <button type="submit" className={styles.enter} disabled={pending}>
        {pending ? 'bekle' : 'kod iste'}
      </button>
    </form>
  );
}
