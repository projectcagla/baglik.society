'use client';

import { useActionState, useId, useState } from 'react';
import { enterAction, type DoorState } from '@/server/actions/door';
import styles from './Door.module.css';

const initial: DoorState = { message: null };

export function DoorForm() {
  const [state, action, pending] = useActionState(enterAction, initial);
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <form action={action} className={styles.form} data-pending={pending || undefined} noValidate>
      <label htmlFor={`${id}-code`} className={styles.label}>
        giriş kodu
      </label>
      <div className={styles.field}>
        <input
          id={`${id}-code`}
          name="code"
          type={revealed ? 'text' : 'password'}
          className={styles.input}
          autoComplete="current-password"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          maxLength={64}
          required
          aria-invalid={state.message ? true : undefined}
          aria-describedby={state.message ? errorId : undefined}
          disabled={pending}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={revealed ? 'kodu gizle' : 'kodu göster'}
        >
          {revealed ? 'gizle' : 'göster'}
        </button>
      </div>
      <p id={errorId} className={styles.message} role="status" aria-live="polite">
        {state.message}
      </p>
      <button type="submit" className={styles.enter} disabled={pending} aria-busy={pending || undefined}>
        {pending ? 'bekle' : 'giriş'}
      </button>
    </form>
  );
}
