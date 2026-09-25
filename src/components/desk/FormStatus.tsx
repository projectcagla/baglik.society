import ui from '@/components/ui/ui.module.css';
import styles from './Desk.module.css';
import type { DeskState } from '@/server/actions/desk';

export function FormStatus({ state }: { state: DeskState }) {
  return (
    <>
      <p
        className={`${ui.status} ${state.ok ? ui.statusOk : state.message ? ui.statusBad : ''}`}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>
      {state.secrets && state.secrets.length > 0 && (
        <div className={styles.secret}>
          <p className="meta">tek seferlik gösterim — şimdi kopyala ve kişiye özel ilet</p>
          {state.secrets.map((s) => (
            <p key={s.code}>
              {s.name}: <code>{s.code}</code>
            </p>
          ))}
        </div>
      )}
    </>
  );
}
