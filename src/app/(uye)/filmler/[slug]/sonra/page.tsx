import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContributionForm } from '@/components/member/ContributionForm';
import { FilmHeader } from '@/components/member/FilmHeader';
import { ResourceEntry } from '@/components/member/ResourceEntry';
import styles from '@/components/member/Discussion.module.css';
import ed from '@/components/member/Editorial.module.css';
import { formatDay } from '@/lib/dates';
import { RichText } from '@/lib/richtext';
import { brandLower } from '@/lib/text';
import { withdrawContributionAction } from '@/server/actions/member';
import { moderateAction } from '@/server/actions/desk';
import { PrintButton } from '@/components/ui/PrintButton';
import { requireMember, type Viewer } from '@/server/auth/viewer';
import { getFilm, getMarks } from '@/server/dal/films';
import { listContributions, type Contribution } from '@/server/dal/journal';

export async function generateMetadata(
  props: PageProps<'/filmler/[slug]/sonra'>,
): Promise<Metadata> {
  const viewer = await requireMember();
  const detail = await getFilm(viewer, (await props.params).slug);
  return { title: detail ? `sonrası · ${brandLower(detail.film.title)}` : 'sonrası' };
}

interface ThreadCtx {
  items: Contribution[];
  ids: Set<string>;
  viewer: Viewer;
  moderator: boolean;
  filmId: string;
  path: string;
  open: boolean;
}

const shown = (c: Contribution, t: ThreadCtx) =>
  c.status === 'yayinda' || (t.moderator && c.status === 'kaldirildi');

function childrenOf(id: string, t: ThreadCtx) {
  return t.items.filter((c) => c.parent_id === id);
}

function stillMatters(c: Contribution, t: ThreadCtx): boolean {
  return shown(c, t) || childrenOf(c.id, t).some((x) => stillMatters(x, t));
}

/**
 * Chronological, at most two replies deep, no counts or likes. A withdrawn
 * or removed contribution keeps its place (without its text) only when
 * replies hang from it; replies whose parent is gone stand on their own.
 */
function Thread({ list, t }: { list: Contribution[]; t: ThreadCtx }) {
  const level = list.filter((c) => stillMatters(c, t));
  if (!level.length) return null;
  return (
    <ul role="list" className={styles.thread}>
      {level.map((c) => {
        const orphan = c.parent_id !== null && !t.ids.has(c.parent_id);
        const removed = c.status === 'kaldirildi';
        return (
          <li key={c.id} className={styles.contribution}>
            {!shown(c, t) ? (
              <p className={styles.gone}>
                {removed ? 'bu katkı kaldırıldı.' : 'bu katkı geri çekildi.'}
              </p>
            ) : (
              <>
                {orphan && <p className={styles.gone}>yanıt verdiği katkı artık görünmüyor.</p>}
                <p className={styles.by}>
                  {c.attribution === 'anonim' ? 'adsız' : c.attribution_name} ·{' '}
                  {formatDay(c.created_at)}
                  {removed && <span className={styles.flag}> · kaldırıldı (moderasyon)</span>}
                </p>
                <RichText
                  source={c.body}
                  className={removed ? `${styles.body} ${styles.moderated}` : styles.body}
                />
                <div className={styles.tools}>
                  {t.open && !removed && c.depth < 2 && (
                    <details>
                      <summary>yanıtla</summary>
                      <ContributionForm
                        filmId={t.filmId}
                        questionId={c.question_id}
                        parentId={c.id}
                        path={t.path}
                        label="yanıtın"
                      />
                    </details>
                  )}
                  {t.moderator && c.member_id !== t.viewer.id && (
                    <form action={moderateAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="what" value="contribution" />
                      <input type="hidden" name="op" value={removed ? 'restore' : 'remove'} />
                      <input type="hidden" name="path" value={t.path} />
                      <button type="submit" className={styles.linkButton}>
                        {removed ? 'geri aç (moderasyon)' : 'kaldır (moderasyon)'}
                      </button>
                    </form>
                  )}
                  {c.member_id === t.viewer.id && !removed && (
                    <form action={withdrawContributionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="path" value={t.path} />
                      <button type="submit" className={styles.linkButton}>
                        geri çek
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
            <Thread list={childrenOf(c.id, t)} t={t} />
          </li>
        );
      })}
    </ul>
  );
}

export default async function AfterPage(props: PageProps<'/filmler/[slug]/sonra'>) {
  const viewer = await requireMember();
  const { slug } = await props.params;
  const preview = viewer.isStaff && (await props.searchParams).gorunum === 'uye';
  const detail = await getFilm(viewer, slug, { asMemberPreview: preview });
  if (!detail) notFound();
  const { film, before, after, questions, notes, afterVisible, events } = detail;
  const desk = viewer.isStaff && !preview;
  const canSee = afterVisible || desk;
  const path = `/filmler/${film.slug}/sonra`;
  const header = (
    <FilmHeader
      film={film}
      layer="sonra"
      kicker="gösterim sonrası"
      afterVisible={afterVisible}
      events={events}
      staff={viewer.isStaff}
      preview={preview}
    />
  );

  if (!canSee) {
    return (
      <div className={ed.page}>
        {header}
        <p className={ed.empty}>sonrası, gece gerçekleştikten sonra editör tarafından açılır.</p>
      </div>
    );
  }

  const [contributions, marks] = await Promise.all([
    listContributions(viewer, film.id),
    getMarks(viewer, film.id),
  ]);
  const afterQuestions = questions.filter((q) => q.layer === 'sonra');
  const moderator = viewer.isAdmin && viewer.mfaFresh && !preview;
  const t: ThreadCtx = {
    items: contributions,
    ids: new Set(contributions.map((c) => c.id)),
    viewer,
    moderator,
    filmId: film.id,
    path,
    open: afterVisible,
  };
  const topLevel = (questionId: string) =>
    contributions.filter(
      (c) => c.question_id === questionId && (c.parent_id === null || !t.ids.has(c.parent_id)),
    );
  const published = contributions.filter((c) => c.status === 'yayinda').length;
  // only nights that actually took place; nothing is inferred
  const nights = events.filter((e) => e.took_place);

  return (
    <div className={ed.page}>
      {header}
      {!afterVisible && (
        <p className={ed.notice}>
          bu katman yayında değil. yalnızca masa görebilir; üyelere sunucu hiçbir şey göndermiyor.
        </p>
      )}

      {/* 1 — the editor's note: optional, written by a person, never a filler summary */}
      {notes.length > 0 ? (
        <section className={ed.section} aria-labelledby="not">
          <h2 id="not" className={ed.kicker}>
            editörün notu
          </h2>
          {notes.map((n) => (
            <article key={n.id} className={styles.note}>
              <h3 className={ed.h3}>
                {brandLower(n.title)}
                {n.status === 'taslak' && (
                  <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>
                )}
              </h3>
              <RichText source={n.body} className={ed.prose} />
              {n.author_credit && <p className="meta">{n.author_credit}</p>}
            </article>
          ))}
        </section>
      ) : (
        desk && (
          <p className={ed.notice}>
            editör notu yok. isteğe bağlı (80–180 kelime); boşken üyeler bu bölümü hiç görmez.
          </p>
        )
      )}

      {/* 2–3 — questions left on the table, each with its conversation */}
      {afterQuestions.length > 0 ? (
        <section className={ed.section} aria-labelledby="sorular">
          <h2 id="sorular" className={ed.h2}>
            masadan kalan sorular
          </h2>
          <p className={styles.rule}>
            katkılar yazıldıkları sırayla durur; beğeni ya da sayaç yok. yazdığın düzenlenmez,
            istediğin zaman geri çekebilirsin. adınla ya da adsız yazabilirsin.
          </p>
          {afterQuestions.map((q) => (
            <article key={q.id} className={styles.question}>
              <p className={styles.questionText}>
                {q.body}
                {q.status === 'taslak' && (
                  <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>
                )}
              </p>
              <Thread list={topLevel(q.id)} t={t} />
              {afterVisible && (
                <details className={styles.add}>
                  <summary>düşünceni ekle</summary>
                  <ContributionForm
                    filmId={film.id}
                    questionId={q.id}
                    parentId={null}
                    path={path}
                    label="düşüncen"
                  />
                </details>
              )}
            </article>
          ))}
        </section>
      ) : (
        desk && (
          <p className={ed.notice}>
            sonra katmanında soru yok. tartışma, masadan bırakılan 2–4 soruyla açılır.
          </p>
        )
      )}

      {/* 4 — further reading; spoilers are stated on each source */}
      {after.length > 0 && (
        <section className={ed.section} aria-labelledby="ileri">
          <h2 id="ileri" className={ed.h2}>
            ileri okuma
          </h2>
          {after.map((r, i) => (
            <ResourceEntry
              key={r.id}
              r={r}
              index={i + 1}
              total={after.length}
              mark={marks.get(r.id)}
              path={path}
              compact
            />
          ))}
        </section>
      )}

      {/* 5 — the record of the night: only what actually happened */}
      <section className={ed.section} aria-labelledby="kayit">
        <h2 id="kayit" className={ed.kicker}>
          gecenin kaydı
        </h2>
        <dl className={styles.record}>
          <dt>gece</dt>
          <dd>
            {nights.length > 0
              ? nights.map((e) => (
                  <span key={e.starts_at.toISOString()}>
                    {e.number && e.invited ? (
                      <Link href={`/geceler/${e.number}`}>{e.number}. film gecesi</Link>
                    ) : e.number ? (
                      `${e.number}. film gecesi`
                    ) : (
                      'film gecesi'
                    )}{' '}
                    · {formatDay(e.starts_at)}
                  </span>
                ))
              : film.screened_on
                ? formatDay(film.screened_on)
                : 'izlendi · tarihi kayda geçmedi'}
          </dd>
          <dt>önce</dt>
          <dd>
            {before.length > 0 ? (
              <Link href={`/filmler/${film.slug}/okuma`}>{before.length} kaynaklık seçki</Link>
            ) : (
              'seçki yok'
            )}
          </dd>
          <dt>sonra</dt>
          <dd>
            {afterQuestions.length} soru · {published} katkı
          </dd>
          {film.curator_credit && (
            <>
              <dt>seçki</dt>
              <dd>{film.curator_credit}</dd>
            </>
          )}
        </dl>
        <p className="no-print">
          <PrintButton label="oturum dosyası · yazdır / pdf" />
        </p>
      </section>
    </div>
  );
}
