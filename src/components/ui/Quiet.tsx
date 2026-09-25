import styles from './Quiet.module.css';

/** Shared frame for 404 / 403 / error pages: the mark and one sentence. */
export function Quiet({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className={styles.quiet}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.svg" alt="" width={48} height={90} className={styles.mark} />
      <h1 className={styles.title}>{title}</h1>
      {children}
    </main>
  );
}
