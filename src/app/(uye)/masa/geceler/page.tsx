import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatEventDate } from '@/lib/dates';
import { brandLower } from '@/lib/text';
import { requireStaff } from '@/server/auth/viewer';
import { deskEvents } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · geceler' };

export default async function DeskEvents() {
  const viewer = await requireStaff();
  const events = await deskEvents(viewer);
  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>geceler</h1>
        {viewer.isAdmin && (
          <Link href="/masa/geceler/yeni" className={`${ui.button} ${ui.small}`}>
            yeni gece
          </Link>
        )}
      </div>
      {!viewer.isAdmin && (
        <p className="meta">
          geceler, davetler ve konum yalnızca yöneticiler tarafından düzenlenir.
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>no</th>
              <th>film</th>
              <th>zaman</th>
              <th>durum</th>
              {viewer.isAdmin && <th>katılım</th>}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="meta">{e.number ?? '—'}</td>
                <td>
                  {viewer.isAdmin ? (
                    <Link href={`/masa/geceler/${e.id}`}>
                      {e.film_title ? brandLower(e.film_title) : 'film yok'}
                    </Link>
                  ) : e.film_title ? (
                    brandLower(e.film_title)
                  ) : (
                    '—'
                  )}
                </td>
                <td>{formatEventDate(e.starts_at)}</td>
                <td>{e.status}</td>
                {viewer.isAdmin && (
                  <td>
                    {e.invited} davetli · {e.yes} geliyorum
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
