'use client';

import { useActionState, useId } from 'react';
import { contributionAction, type ActionState } from '@/server/actions/member';
import ui from '@/components/ui/ui.module.css';

const initial: ActionState = { ok: false, message: null };

export function ContributionForm({
  filmId,
  questionId,
  parentId,
  path,
  label,
}: {
  filmId: string;
  questionId: string | null;
  parentId: string | null;
  path: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(contributionAction, initial);
  const id = useId();
  return (
    <form action={action} className={ui.field}>
      <input type="hidden" name="filmId" value={filmId} />
      <input type="hidden" name="questionId" value={questionId ?? ''} />
      <input type="hidden" name="parentId" value={parentId ?? ''} />
      <input type="hidden" name="path" value={path} />
      <label htmlFor={`${id}-body`} className={ui.label}>
        {label}
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        className={ui.textarea}
        maxLength={1200}
        required
        rows={4}
      />
      <fieldset className={ui.fieldset}>
        <legend>görünürlük</legend>
        <div className={ui.segmented}>
          <label>
            <input type="radio" name="attribution" value="isimli" defaultChecked /> adımla
          </label>
          <label>
            <input type="radio" name="attribution" value="anonim" /> adsız
          </label>
        </div>
      </fieldset>
      <div className={ui.row}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? 'bekle' : 'ekle'}
        </button>
        <p
          className={`${ui.status} ${state.ok ? ui.statusOk : state.message ? ui.statusBad : ''}`}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      </div>
      <p className={ui.hint}>yalnızca üyeler görür. istediğin zaman geri çekebilirsin.</p>
    </form>
  );
}
