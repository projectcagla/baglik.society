'use client';

import { useActionState } from 'react';
import { reportLinkAction, type ActionState } from '@/server/actions/member';
import styles from './Reading.module.css';

const initial: ActionState = { ok: false, message: null };

/** "the link does not open" → a check request on the editor's desk. */
export function LinkReport({ resourceId }: { resourceId: string }) {
  const [state, action, pending] = useActionState(reportLinkAction, initial);
  if (state.ok) {
    return (
      <p className={styles.markNote} role="status">
        bildirildi; editör kontrol edecek.
      </p>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="resourceId" value={resourceId} />
      <button type="submit" className={styles.mark} disabled={pending}>
        bağlantı açılmıyor mu?
      </button>
    </form>
  );
}
