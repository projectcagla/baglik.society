import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/member/Film.module.css';
import ed from '@/components/member/Editorial.module.css';
import { formatDay } from '@/lib/dates';
import { brandLower, programNo, FILM_STATUS_LABELS } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { listFilms, type FilmListItem } from '@/server/dal/films';

export const metadata: Metadata = { title: 'filmler' };

function FilmRowItem({ f, staff }: { f: FilmListItem; staff: boolean }) {
  const draft = !f.published_at;
  return (
    <li>
      <Link href={`/filmler/${f.slug}`} className={styles.row}>
        <span className={styles.rowNo}>{programNo(f.program_no)}</span>
        <span className={styles.rowTitle}>{brandLower(f.title)}</span>
        <span className={styles.rowMeta}>
          {f.director && <span>{brandLower(f.director)}</span>}
          {f.year && <span>{f.year}</span>}
          {f.screened_on && <span>{formatDay(f.screened_on)}</span>}
          {f.themes[0] && <span>{brandLower(f.themes[0])}</span>}
          {f.reading_count > 0 && <span>önce · {f.reading_count} kaynak</span>}
          {f.after_visible && <span>sonrası açık</span>}
          {staff && <span>{FILM_STATUS_LABELS[f.status]}</span>}
          {draft && <span className={`${ed.badge} ${ed.badgeDraft}`}>taslak</span>}
        </span>
      </Link>
    </li>
  );
}

export default async function FilmsPage() {
  const viewer = await requireMember();
  const films = await listFilms(viewer);
  const upcoming = films.filter((f) => f.status === 'yaklasiyor' || f.status === 'secildi');
  const archive = films.filter((f) => f.status === 'izlendi' || f.status === 'arsiv');
  const ideas = viewer.isStaff ? films.filter((f) => f.status === 'oneri') : [];

  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <h1 className={ed.h1}>filmler</h1>
      </header>

      <section className={ed.section} aria-labelledby="sirada">
        <h2 id="sirada" className={ed.kicker}>
          sırada
        </h2>
        {upcoming.length ? (
          <ul role="list" className={ed.list}>
            {upcoming.map((f) => (
              <FilmRowItem key={f.id} f={f} staff={viewer.isStaff} />
            ))}
          </ul>
        ) : (
          <p className={ed.empty}>sırada bir film yok.</p>
        )}
      </section>

      <section className={ed.section} aria-labelledby="arsiv">
        <h2 id="arsiv" className={ed.kicker}>
          arşiv
        </h2>
        {archive.length ? (
          <ul role="list" className={ed.list}>
            {archive.map((f) => (
              <FilmRowItem key={f.id} f={f} staff={viewer.isStaff} />
            ))}
          </ul>
        ) : (
          <p className={ed.empty}>arşiv henüz boş.</p>
        )}
      </section>

      {ideas.length > 0 && (
        <section className={ed.section} aria-labelledby="oneriler">
          <h2 id="oneriler" className={ed.kicker}>
            öneriler · yalnızca masa görür
          </h2>
          <ul role="list" className={ed.list}>
            {ideas.map((f) => (
              <FilmRowItem key={f.id} f={f} staff />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
