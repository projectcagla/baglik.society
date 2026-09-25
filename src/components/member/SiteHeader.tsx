import Link from 'next/link';
import { monogram } from '@/lib/text';
import { NavLinks } from './NavLinks';
import styles from './Shell.module.css';

export function SiteHeader({ name, staff }: { name: string; staff: boolean }) {
  return (
    <header className={`${styles.header} no-print`}>
      <div className={styles.headerRow}>
        <Link href="/oda" className={styles.brand} aria-label="bağlık.society — oda">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.webp" alt="" width={484} height={112} />
        </Link>
        <Link href="/profil" className={styles.monogram} aria-label={`profil — ${name}`} title={name}>
          <span aria-hidden="true">{monogram(name)}</span>
        </Link>
      </div>
      <NavLinks staff={staff} />
    </header>
  );
}
