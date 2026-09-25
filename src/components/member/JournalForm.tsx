'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { saveEntryAction, type ActionState } from '@/server/actions/member';
import ui from '@/components/ui/ui.module.css';

const initial: ActionState = { ok: false, message: null };

export interface FilmOption {
  id: string;
  label: string;
}

export function JournalForm({
  films,
  entry,
}: {
  films: FilmOption[];
  entry?: { id: string; filmId: string | null; kind: string; body: string };
}) {
  const [state, action, pending] = useActionState(saveEntryAction, initial);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !entry) form.current?.reset();
  }, [state, entry]);
  return (
    <form ref={form} action={action} className={ui.field}>
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className={ui.field}>
        <label htmlFor={`${id}-film`} className={ui.label}>
          film
        </label>
        <select
          id={`${id}-film`}
          name="filmId"
          className={ui.select}
          defaultValue={entry?.filmId ?? ''}
        >
          <option value="">— film seçme —</option>
          {films.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className={ui.fieldset}>
        <legend>ne zaman</legend>
        <div className={ui.segmented}>
          {[
            ['beklenti', 'izlemeden önce'],
            ['hatira', 'izledikten sonra'],
            ['serbest', 'serbest'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="kind"
                value={value}
                defaultChecked={(entry?.kind ?? 'serbest') === value}
              />{' '}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={ui.field}>
        <label htmlFor={`${id}-body`} className={ui.label}>
          not
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          className={ui.textarea}
          rows={6}
          maxLength={5000}
          required
          defaultValue={entry?.body}
        />
      </div>
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
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
