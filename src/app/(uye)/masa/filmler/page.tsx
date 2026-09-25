import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { FILM_STATUS_LABELS, brandLower, programNo } from '@/lib/text';
import { requireStaff } from '@/server/auth/viewer';
import { deskFilms } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · filmler' };

export default async function DeskFilms() {
  const viewer = await requireStaff();
  const films = await deskFilms(viewer);
  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>filmler</h1>
        <Link href="/masa/filmler/yeni" className={`${ui.button} ${ui.small}`}>
          yeni film
        </Link>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>no</th>
              <th>film</th>
              <th>durum</th>
              <th>yayın</th>
              <th>kaynak</th>
            </tr>
          </thead>
          <tbody>
            {films.map((f) => (
              <tr key={f.id}>
                <td className="meta">{programNo(f.program_no)}</td>
                <td>
                  <Link href={`/masa/filmler/${f.id}`}>{brandLower(f.title)}</Link>
                  <div className="meta">{[f.director, f.year].filter(Boolean).join(' · ')}</div>
                </td>
                <td>{FILM_STATUS_LABELS[f.status]}</td>
                <td>
                  <span className={`${styles.pill} ${f.published_at ? styles.pillOk : styles.pillWarn}`}>{f.published_at ? 'film yayında' : 'taslak'}</span>{' '}
                  <span className={`${styles.pill} ${f.after_published_at ? styles.pillOk : ''}`}>{f.after_published_at ? 'sonrası açık' : 'sonrası kapalı'}</span>
                </td>
                <td>
                  {f.resource_count}
                  {f.draft_count > 0 && <span className="meta"> · {f.draft_count} taslak</span>}
                  {f.broken_count > 0 && <span className={`${styles.pill} ${styles.pillBad}`}> {f.broken_count} sorunlu</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
