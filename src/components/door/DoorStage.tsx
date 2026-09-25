import styles from './Door.module.css';

/** The approved lockup (portal above wordmark), cropped from the master. */
export function DoorStage({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className={styles.door}>
      <div className={styles.stage} data-compact={compact || undefined}>
        {!compact && (
          <div className={styles.portal} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand raster, no optimisation wanted */}
            <img src="/brand/portal.webp" alt="" width={396} height={396} fetchPriority="high" decoding="async" />
          </div>
        )}
        <h1 className={styles.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.webp" alt="bağlık.society" width={484} height={112} decoding="async" />
        </h1>
        {children}
      </div>
    </main>
  );
}
