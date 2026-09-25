import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilmHeader } from '@/components/member/FilmHeader';
import { ResourceEntry, anchorOf } from '@/components/member/ResourceEntry';
import styles from '@/components/member/Reading.module.css';
import ed from '@/components/member/Editorial.module.css';
import { PrintButton } from '@/components/ui/PrintButton';
import ui from '@/components/ui/ui.module.css';
import { brandLower, readingMinutes } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { getFilm, getMarks } from '@/server/dal/films';

export async function generateMetadata(props: PageProps<'/filmler/[slug]/okuma'>): Promise<Metadata> {
  const viewer = await requireMember();
  const detail = await getFilm(viewer, (await props.params).slug);
  return { title: detail ? `okuma · ${brandLower(detail.film.title)}` : 'okuma' };
}

export default async function ReadingRoom(props: PageProps<'/filmler/[slug]/okuma'>) {
  const viewer = await requireMember();
  const { slug } = await props.params;
  const preview = viewer.isStaff && (await props.searchParams).gorunum === 'uye';
  const detail = await getFilm(viewer, slug, { asMemberPreview: preview });
  if (!detail) notFound();
  const { film, before, afterVisible } = detail;
  const marks = await getMarks(viewer, film.id);
  const path = `/filmler/${film.slug}/okuma`;
  const main = before.filter((r) => r.section !== 'eslik');
  const companions = before.filter((r) => r.section === 'eslik');
  const total = before.length;
  const minutes = readingMinutes(before.map((r) => r.note ?? '').join(' '));
  const hasSummaries = before.some((r) => r.rights_status === 'ozgun_ozet');

  return (
    <div className={ed.page}>
      <FilmHeader film={film} layer="okuma" afterVisible={afterVisible} staff={viewer.isStaff} preview={preview} />

      <div className={styles.room}>
        {total === 0 ? (
          <p className={ed.empty}>seçki henüz hazırlanıyor.</p>
        ) : (
          <>
            <nav className={`${styles.contents} no-print`} aria-label="bu dosyada">
              <p className="meta">
                {brandLower(film.reading_label) || 'okuma'} · {total} kaynak · yaklaşık {minutes} dk
              </p>
              <ol>
                {before.map((r, i) => (
                  <li key={r.id}>
                    <a href={`#${anchorOf(r)}`}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <span>{r.heading ?? r.title_original}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {main.map((r, i) => (
              <ResourceEntry key={r.id} r={r} index={i + 1} total={total} mark={marks.get(r.id)} path={path} />
            ))}

            {companions.length > 0 && (
              <section className={ed.section} aria-labelledby="eslik">
                <hr className={styles.divider} />
                <p className={ed.kicker}>bağlam / dinle / izle</p>
                <h2 id="eslik" className={ed.h2}>
                  eşlik edenler
                </h2>
                <div>
                  {companions.map((r, i) => (
                    <ResourceEntry
                      key={r.id}
                      r={r}
                      index={main.length + i + 1}
                      total={total}
                      mark={marks.get(r.id)}
                      path={path}
                      compact
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className={styles.footer}>
          {hasSummaries && (
            <p>türkçe bölümler, bağlantı verilen yazılara dayanan özgün kısa özetlerdir; birebir çeviri değildir.</p>
          )}
          {film.curator_credit && <p className="meta">seçki / {film.curator_credit}</p>}
          <div className={`${ui.row} no-print`}>
            <PrintButton />
            <Link href={`/filmler/${film.slug}`}>film sayfasına dön</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
