import Link from 'next/link';
import type { FilmEvent, FilmRow } from '@/server/dal/films';
import { brandLower, programNo } from '@/lib/text';
import styles from './Film.module.css';
import ed from './Editorial.module.css';

export type FilmLayer = 'dosya' | 'once' | 'sonra';

/**
 * One header for the film's three documents — önce (reading), gece (the
 * night), sonra (after). `compact` keeps the first phone screen for the
 * reading itself: number, title, director, the three layers.
 */
export function FilmHeader({
  film,
  layer,
  afterVisible,
  events,
  staff,
  preview,
  kicker,
}: {
  film: FilmRow;
  layer: FilmLayer;
  afterVisible: boolean;
  events: FilmEvent[];
  staff: boolean;
  preview: boolean;
  kicker?: string;
}) {
  const base = `/filmler/${film.slug}`;
  const q = preview ? '?gorunum=uye' : '';
  const draft = !film.published_at;
  const compact = layer !== 'dosya';
  const night = events.find((e) => e.number && (e.invited || (staff && !preview)));
  const byline = [film.director && brandLower(film.director), film.year]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className={compact ? styles.headCompact : styles.head}>
      <p className={ed.kicker}>
        <Link href={`${base}${q}`}>{programNo(film.program_no)}</Link>
        {' / '}
        {kicker ?? 'film dosyası'}
        {draft && <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>}
      </p>
      <h1 className={compact ? styles.filmTitleCompact : styles.filmTitle}>
        {brandLower(film.title)}
      </h1>
      <p className={styles.original}>
        {!compact &&
          film.title_original &&
          film.title_original.toLocaleLowerCase('en') !== film.title.toLocaleLowerCase('en') && (
            <>
              <span lang="en">{film.title_original}</span> ·{' '}
            </>
          )}
        {byline}
      </p>
      {!compact && film.curator_credit && (
        <p className={styles.credit}>
          <em>seçki ve notlar</em> <span>{film.curator_credit}</span>
        </p>
      )}
      <nav className={`${styles.layers} no-print`} aria-label="filmin belgeleri">
        <Link href={`${base}/okuma${q}`} aria-current={layer === 'once' ? 'page' : undefined}>
          önce
        </Link>
        {night ? (
          <Link href={`/geceler/${night.number}`}>gece</Link>
        ) : (
          <span className={styles.locked}>gece</span>
        )}
        {afterVisible || (staff && !preview) ? (
          <Link href={`${base}/sonra${q}`} aria-current={layer === 'sonra' ? 'page' : undefined}>
            sonra{!afterVisible && <span className={styles.lockNote}> · yayında değil</span>}
          </Link>
        ) : (
          <span className={styles.locked}>
            sonra<span className={styles.lockNote}> · geceden sonra</span>
          </span>
        )}
      </nav>
      {staff && (
        <p className={`${styles.staffLine} no-print`}>
          {preview ? (
            <>
              üye görünümü (üye yetkisiyle) ·{' '}
              <Link
                href={`${base}${layer === 'dosya' ? '' : layer === 'once' ? '/okuma' : '/sonra'}`}
              >
                masa görünümüne dön
              </Link>
            </>
          ) : (
            <>
              <Link href={`/masa/filmler/${film.id}`}>masada düzenle</Link> ·{' '}
              <Link
                href={`${base}${layer === 'dosya' ? '' : layer === 'once' ? '/okuma' : '/sonra'}?gorunum=uye`}
              >
                üye gibi gör
              </Link>
            </>
          )}
        </p>
      )}
    </header>
  );
}
