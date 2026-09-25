import Link from 'next/link';
import type { FilmRow } from '@/server/dal/films';
import { brandLower, programNo, FILM_STATUS_LABELS } from '@/lib/text';
import styles from './Film.module.css';
import ed from './Editorial.module.css';

export function FilmHeader({
  film,
  layer,
  afterVisible,
  staff,
  preview,
}: {
  film: FilmRow;
  layer: 'once' | 'sonra' | 'okuma';
  afterVisible: boolean;
  staff: boolean;
  preview: boolean;
}) {
  const base = `/filmler/${film.slug}`;
  const q = preview ? '?gorunum=uye' : '';
  const draft = !film.published_at;
  return (
    <header className={styles.head}>
      <p className={ed.kicker}>
        <Link href="/filmler">film</Link> {programNo(film.program_no)} · {FILM_STATUS_LABELS[film.status]}
        {draft && <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>}
      </p>
      <h1 className={styles.filmTitle}>{brandLower(film.title)}</h1>
      <p className={styles.original}>
        {[film.title_original && film.title_original.toLocaleLowerCase('en') !== film.title.toLocaleLowerCase('en') ? film.title_original : null, film.director && brandLower(film.director), film.year]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {film.curator_credit && (
        <p className={styles.credit}>
          <em>seçki ve notlar</em> <span>{film.curator_credit}</span>
        </p>
      )}
      <nav className={styles.layers} aria-label="film katmanları">
        <Link href={`${base}${q}`} aria-current={layer === 'once' ? 'page' : undefined}>
          önce
        </Link>
        <Link href={`${base}/okuma${q}`} aria-current={layer === 'okuma' ? 'page' : undefined}>
          okuma
        </Link>
        {afterVisible || (staff && !preview) ? (
          <Link href={`${base}/sonra${q}`} aria-current={layer === 'sonra' ? 'page' : undefined}>
            sonra{!afterVisible && ' (yayında değil)'}
          </Link>
        ) : (
          <span className={styles.locked} title="sonrası, gösterimden sonra açılır">sonra · kapalı</span>
        )}
      </nav>
      {staff && (
        <p className="meta no-print">
          {preview ? (
            <Link href={base}>masa görünümüne dön</Link>
          ) : (
            <>
              <Link href={`/masa/filmler/${film.id}`}>masada düzenle</Link> ·{' '}
              <Link href={`${base}${layer === 'once' ? '' : `/${layer}`}?gorunum=uye`}>üye gibi gör</Link>
            </>
          )}
        </p>
      )}
    </header>
  );
}
