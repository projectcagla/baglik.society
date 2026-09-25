'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Shell.module.css';

const SECTIONS = [
  { href: '/oda', label: 'oda' },
  { href: '/filmler', label: 'filmler' },
  { href: '/geceler', label: 'geceler' },
  { href: '/defter', label: 'defter' },
];

export function NavLinks({ staff }: { staff: boolean }) {
  const pathname = usePathname();
  const items = staff ? [...SECTIONS, { href: '/masa', label: 'masa' }] : SECTIONS;
  return (
    <nav aria-label="bölümler" className={styles.nav}>
      <ul role="list">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-staff={item.href === '/masa' || undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
