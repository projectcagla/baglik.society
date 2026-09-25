'use client';

import { useActionState } from 'react';
import { profileAction, type ActionState } from '@/server/actions/member';
import ui from '@/components/ui/ui.module.css';

const initial: ActionState = { ok: false, message: null };

export function ProfileForm({ name, email }: { name: string; email: string | null }) {
  const [state, action, pending] = useActionState(profileAction, initial);
  return (
    <form action={action} className={ui.field}>
      <div className={ui.field}>
        <label htmlFor="p-name" className={ui.label}>
          ad
        </label>
        <input
          id="p-name"
          name="displayName"
          className={ui.input}
          defaultValue={name}
          maxLength={80}
          required
          autoComplete="name"
        />
      </div>
      <div className={ui.field}>
        <label htmlFor="p-email" className={ui.label}>
          e-posta{' '}
          <span className={ui.hint}>(yalnızca giriş kodu kurtarma ve gece bildirimleri için)</span>
        </label>
        <input
          id="p-email"
          name="email"
          type="email"
          className={ui.input}
          defaultValue={email ?? ''}
          maxLength={200}
          autoComplete="email"
        />
      </div>
      <div className={ui.row}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? 'bekle' : 'kaydet'}
        </button>
        <p
          className={`${ui.status} ${state.ok ? ui.statusOk : state.message ? ui.statusBad : ''}`}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      </div>
    </form>
  );
}
