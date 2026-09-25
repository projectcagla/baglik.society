import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilmHeader } from '@/components/member/FilmHeader';
import { anchorOf } from '@/components/member/ResourceEntry';
import styles from '@/components/member/Film.module.css';
import ed from '@/components/member/Editorial.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatDay, formatEventDate } from '@/lib/dates';
import { RichText } from '@/lib/richtext';
import { brandLower, SECTION_LABELS, readingMinutes } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { getFilm, getMarks } from '@/server/dal/films';
import { listOwnEntries } from '@/server/dal/journal';

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
  // the viewer's own traces; nobody else's
  const [marks, entries] = await Promise.all([getMarks(viewer, film.id), listOwnEntries(viewer)]);
  const read = before.filter((r) => marks.get(r.id)?.read_at).length;
  const later = before.filter((r) => marks.get(r.id)?.saved_at).length;
  const notesHere = entries.filter((e) => e.film_id === film.id).length;
  const afterQuestions = questions.filter((x) => x.layer === 'sonra').length;
  const sections = (['okuma', 'izleme', 'eslik'] as const)
    .map((s) => ({ key: s, items: before.filter((r) => r.section === s) }))
    .filter((s) => s.items.length);
  // same measure as the reading page: the curator's own text
  const minutes = readingMinutes(
    before.map((r) => [r.rationale, r.note, r.prompt].filter(Boolean).join(' ')).join(' '),
  );
  const q = preview ? '?gorunum=uye' : '';
  let n = 0;

  return (
    <div className={ed.page}>
      <FilmHeader
        film={film}
        layer="dosya"
        afterVisible={afterVisible}
        events={events}
        staff={viewer.isStaff}
        preview={preview}
      />

      <div className={styles.twoCol}>
        <div className={ed.section}>
          {film.intro && <RichText source={film.intro} className={ed.prose} />}

          <section className={styles.doc} aria-labelledby="belge-once">
            <p className={ed.kicker}>önce</p>
            <div className={ed.sectionHead}>
              <h2 id="belge-once" className={ed.h2}>
                {brandLower(film.reading_label) || 'seçki'}
              </h2>
              {before.length > 0 && (
                <span className="meta">
                  {before.length} kaynak · notlar yaklaşık {minutes} dk
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
                  ön okumaya geç <span aria-hidden="true">→</span>
                </Link>
              </p>
            )}

            {questions.filter((x) => x.layer === 'once').length > 0 && (
              <section aria-labelledby="sorular">
                <h3 id="sorular" className={ed.kicker}>
                  düşünmek için
                </h3>
                <ul role="list" className={styles.questions}>
                  {questions
                    .filter((x) => x.layer === 'once')
                    .map((x) => (
                      <li key={x.id}>{x.body}</li>
                    ))}
                </ul>
              </section>
            )}
          </section>

          <section className={styles.doc} aria-labelledby="belge-gece">
            <p className={ed.kicker}>gece</p>
            <h2 id="belge-gece" className={ed.h2}>
              film gecesi
            </h2>
            {events.length === 0 ? (
              <p className={ed.empty}>
                {film.status === 'izlendi' || film.status === 'arsiv'
                  ? 'izlendi; gecenin tarihi kayda geçmedi.'
                  : 'henüz bir gece planlanmadı.'}
              </p>
            ) : (
              <ul role="list" className={ed.list}>
                {events.map((e) => (
                  <li key={e.number ?? e.starts_at.toISOString()}>
                    {e.number && (e.invited || (viewer.isStaff && !preview)) ? (
                      <Link href={`/geceler/${e.number}`}>{e.number}. film gecesi</Link>
                    ) : (
                      <span>{e.number ? `${e.number}. film gecesi` : 'film gecesi'}</span>
                    )}
                    <span className="meta">
                      {' '}
                      · {formatEventDate(e.starts_at)}
                      {e.status === 'iptal'
                        ? ' · iptal edildi'
                        : e.took_place
                          ? ' · gerçekleşti'
                          : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.doc} aria-labelledby="belge-sonra">
            <p className={ed.kicker}>sonra</p>
            <h2 id="belge-sonra" className={ed.h2}>
              gösterim sonrası
            </h2>
            {afterVisible ? (
              <>
                <p className={ed.secondary}>
                  {afterQuestions > 0
                    ? `masadan kalan ${afterQuestions} soru, tartışma ve ileri okuma.`
                    : 'notlar ve ileri okuma.'}
                </p>
                <p>
                  <Link href={`/filmler/${film.slug}/sonra${q}`} className={ui.button}>
                    sonrasına geç <span aria-hidden="true">→</span>
                  </Link>
                </p>
              </>
            ) : (
              <p className={ed.empty}>
                sonrası, gece gerçekleştikten sonra editör tarafından açılır.
              </p>
            )}
          </section>
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
          <div className={styles.mine} aria-labelledby="senin">
            <p id="senin" className={ed.kicker}>
              senin için · yalnızca sen görürsün
            </p>
            <ul role="list" className={ed.list}>
              <li>
                {before.length > 0 ? `okuduğun: ${read} / ${before.length} kaynak` : 'seçki yok'}
              </li>
              {later > 0 && <li>sonra okunacak: {later}</li>}
              <li>
                <Link href="/defter">
                  {notesHere > 0 ? `defterinde bu filme dair ${notesHere} not` : 'deftere not yaz'}
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
