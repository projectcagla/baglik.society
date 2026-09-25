'use client';

import { useActionState } from 'react';
import { rsvpAction, type ActionState } from '@/server/actions/member';
import ui from '@/components/ui/ui.module.css';

const initial: ActionState = { ok: false, message: null };

const OPTIONS = [
  { value: 'geliyorum', label: 'geliyorum' },
  { value: 'gelemiyorum', label: 'gelemiyorum' },
  { value: 'belirsiz', label: 'henüz belli değil' },
] as const;

export function RsvpForm({
  eventId,
  current,
  note,
  closed,
}: {
  eventId: string;
  current: string | null;
  note: string | null;
  closed: string | null;
}) {
  const [state, action, pending] = useActionState(rsvpAction, initial);
  return (
    <form action={action} className={ui.field} aria-describedby="rsvp-status">
      <input type="hidden" name="eventId" value={eventId} />
      <fieldset className={ui.fieldset} disabled={!!closed || pending}>
        <legend className="visually-hidden">katılım</legend>
        <div className={ui.segmented}>
          {OPTIONS.map((o) => (
            <label key={o.value}>
              <input type="radio" name="rsvp" value={o.value} defaultChecked={current === o.value} required />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="rsvp-note" className={`${ui.label} ${ui.spaced}`}>
        not <span className={ui.hint}>(isteğe bağlı, yalnızca yöneticiler görür)</span>
      </label>
      <input id="rsvp-note" name="note" className={ui.input} maxLength={280} defaultValue={note ?? ''} disabled={!!closed} />
      <div className={`${ui.row} ${ui.spaced}`}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={!!closed || pending}>
          {pending ? 'bekle' : 'kaydet'}
        </button>
        <p
          id="rsvp-status"
          className={`${ui.status} ${state.ok ? ui.statusOk : state.message ? ui.statusBad : ''}`}
          role="status"
          aria-live="polite"
        >
          {closed ?? state.message}
        </p>
      </div>
    </form>
  );
}
