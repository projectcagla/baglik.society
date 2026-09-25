import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilmHeader } from '@/components/member/FilmHeader';
import { anchorOf } from '@/components/member/ResourceEntry';
import styles from '@/components/member/Film.module.css';
import ed from '@/components/member/Editorial.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatDay } from '@/lib/dates';
import { RichText } from '@/lib/richtext';
import { brandLower, SECTION_LABELS, readingMinutes } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { getFilm } from '@/server/dal/films';

export async function generateMetadata(props: PageProps<'/filmler/[slug]'>): Promise<Metadata> {
  const viewer = await requireMember();
  const detail = await getFilm(viewer, (await props.params).slug);
  return { title: detail ? brandLower(detail.film.title) : 'film' };
}

export default async function FilmPage(props: PageProps<'/filmler/[slug]'>) {
  const viewer = await requireMember();
  const { slug } = await props.params;
  const preview = viewer.isStaff && (await props.searchParams).gorunum === 'uye';
  const detail = await getFilm(viewer, slug, { asMemberPreview: preview });
  if (!detail) notFound();
  const { film, before, questions, afterVisible, events } = detail;
  const sections = (['okuma', 'izleme', 'eslik'] as const)
    .map((s) => ({ key: s, items: before.filter((r) => r.section === s) }))
    .filter((s) => s.items.length);
  const minutes = readingMinutes(before.map((r) => r.note ?? '').join(' '));
  const q = preview ? '?gorunum=uye' : '';
  let n = 0;

  return (
    <div className={ed.page}>
      <FilmHeader
        film={film}
        layer="once"
        afterVisible={afterVisible}
        staff={viewer.isStaff}
        preview={preview}
      />

      <div className={styles.twoCol}>
        <div className={ed.section}>
          {film.intro && <RichText source={film.intro} className={ed.prose} />}

          <div className={ed.sectionHead}>
            <h2 className={ed.h2}>{brandLower(film.reading_label) || 'seçki'}</h2>
            {before.length > 0 && (
              <span className="meta">
                {before.length} kaynak · yaklaşık {minutes} dk okuma
              </span>
            )}
          </div>

          {sections.length === 0 && <p className={ed.empty}>seçki henüz hazırlanıyor.</p>}
          {sections.map((s) => (
            <section key={s.key} aria-label={SECTION_LABELS[s.key]}>
              <p className={ed.kicker}>{SECTION_LABELS[s.key]}</p>
              <ol className={styles.toc}>
                {s.items.map((r) => {
                  n += 1;
                  return (
                    <li key={r.id}>
                      <Link href={`/filmler/${film.slug}/okuma${q}#${anchorOf(r)}`}>
                        <span className={styles.n}>{String(n).padStart(2, '0')}</span>
                        <span>
                          <strong>{r.heading ?? r.title_original}</strong>
                          <small>
                            {[r.publication, r.author, r.form_label && brandLower(r.form_label)]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {before.length > 0 && (
            <p>
              <Link
                href={`/filmler/${film.slug}/okuma${q}`}
                className={`${ui.button} ${ui.primary}`}
              >
                okuma odasına gir <span aria-hidden="true">→</span>
              </Link>
            </p>
          )}

          {questions.filter((x) => x.layer === 'once').length > 0 && (
            <section className={ed.section} aria-labelledby="sorular">
              <h2 id="sorular" className={ed.kicker}>
                düşünmek için
              </h2>
              <ul role="list" className={styles.questions}>
                {questions
                  .filter((x) => x.layer === 'once')
                  .map((x) => (
                    <li key={x.id}>{x.body}</li>
                  ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={ed.section} aria-label="künye">
          <dl className={styles.facts}>
            {film.title_original && (
              <>
                <dt>özgün ad</dt>
                <dd>{film.title_original}</dd>
              </>
            )}
            {film.director && (
              <>
                <dt>yönetmen</dt>
                <dd>{film.director}</dd>
              </>
            )}
            {film.year && (
              <>
                <dt>yıl</dt>
                <dd>{film.year}</dd>
              </>
            )}
            {film.runtime_min && (
              <>
                <dt>süre</dt>
                <dd>{film.runtime_min} dk</dd>
              </>
            )}
            {film.country && (
              <>
                <dt>ülke</dt>
                <dd>{film.country}</dd>
              </>
            )}
            {film.language && (
              <>
                <dt>dil</dt>
                <dd>{film.language}</dd>
              </>
            )}
            {film.themes.length > 0 && (
              <>
                <dt>izlek</dt>
                <dd>{film.themes.map((t) => brandLower(t)).join(', ')}</dd>
              </>
            )}
            {film.screened_on && (
              <>
                <dt>gösterim</dt>
                <dd>{formatDay(film.screened_on)}</dd>
              </>
            )}
          </dl>
          {events.length > 0 && (
            <div>
              <p className={ed.kicker}>geceler</p>
              <ul role="list" className={ed.list}>
                {events.map((e) => (
                  <li key={e.number ?? e.starts_at.toISOString()}>
                    {e.number ? (
                      <Link href={`/geceler/${e.number}`} className={ed.secondary}>
                        {e.number}. film gecesi · {formatDay(e.starts_at)}
                      </Link>
                    ) : (
                      <span className={ed.secondary}>{formatDay(e.starts_at)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
