'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Desk.module.css';

export function DeskNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: '/masa', label: 'özet', exact: true },
    { href: '/masa/filmler', label: 'filmler' },
    { href: '/masa/geceler', label: 'geceler' },
    ...(admin ? [{ href: '/masa/uyeler', label: 'üyeler' }] : []),
    { href: '/masa/baglantilar', label: 'bağlantılar' },
    ...(admin ? [{ href: '/masa/kayit', label: 'kayıt' }] : []),
    { href: '/masa/guvenlik', label: 'güvenlik' },
  ];
  return (
    <nav className={styles.subnav} aria-label="masa">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
