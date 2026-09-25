import type { Metadata } from 'next';
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
import { requireMember, type Viewer } from '@/server/auth/viewer';
import { getFilm, getMarks } from '@/server/dal/films';
import { listContributions, type Contribution } from '@/server/dal/journal';

export async function generateMetadata(props: PageProps<'/filmler/[slug]/sonra'>): Promise<Metadata> {
  const viewer = await requireMember();
  const detail = await getFilm(viewer, (await props.params).slug);
  return { title: detail ? `sonrası · ${brandLower(detail.film.title)}` : 'sonrası' };
}

function Thread({
  items,
  parentId,
  viewer,
  filmId,
  questionId,
  path,
  open,
}: {
  items: Contribution[];
  parentId: string | null;
  viewer: Viewer;
  filmId: string;
  questionId: string | null;
  path: string;
  open: boolean;
}) {
  const level = items.filter((c) => c.parent_id === parentId && (parentId !== null || c.question_id === questionId));
  if (!level.length) return null;
  return (
    <ul role="list" className={styles.thread}>
      {level.map((c) => (
        <li key={c.id} className={styles.contribution}>
          <p className={styles.by}>
            {c.attribution === 'anonim' ? 'adsız' : c.attribution_name} · {formatDay(c.created_at)}
          </p>
          <RichText source={c.body} className={styles.body} />
          <div className={styles.tools}>
            {open && c.depth < 2 && (
              <details>
                <summary>yanıtla</summary>
                <ContributionForm filmId={filmId} questionId={questionId} parentId={c.id} path={path} label="yanıtın" />
              </details>
            )}
            {c.member_id === viewer.id && (
              <form action={withdrawContributionAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="path" value={path} />
                <button type="submit" className={styles.linkButton}>
                  geri çek
                </button>
              </form>
            )}
          </div>
          <Thread items={items} parentId={c.id} viewer={viewer} filmId={filmId} questionId={questionId} path={path} open={open} />
        </li>
      ))}
    </ul>
  );
}

export default async function AfterPage(props: PageProps<'/filmler/[slug]/sonra'>) {
  const viewer = await requireMember();
  const { slug } = await props.params;
  const preview = viewer.isStaff && (await props.searchParams).gorunum === 'uye';
  const detail = await getFilm(viewer, slug, { asMemberPreview: preview });
  if (!detail) notFound();
  const { film, after, questions, notes, afterVisible } = detail;
  const canSee = afterVisible || (viewer.isStaff && !preview);
  const path = `/filmler/${film.slug}/sonra`;

  if (!canSee) {
    return (
      <div className={ed.page}>
        <FilmHeader film={film} layer="sonra" afterVisible={afterVisible} staff={viewer.isStaff} preview={preview} />
        <p className={ed.empty}>sonrası, gösterimden sonra açılır.</p>
      </div>
    );
  }

  const [contributions, marks] = await Promise.all([listContributions(viewer, film.id), getMarks(viewer, film.id)]);
  const afterQuestions = questions.filter((q) => q.layer === 'sonra');

  return (
    <div className={ed.page}>
      <FilmHeader film={film} layer="sonra" afterVisible={afterVisible} staff={viewer.isStaff} preview={preview} />
      {!afterVisible && (
        <p className={ed.notice}>bu katman yayında değil. yalnızca masa görebilir; üyelere sunucu hiçbir şey göndermiyor.</p>
      )}

      <section className={ed.section} aria-labelledby="notlar">
        <h2 id="notlar" className={ed.h2}>
          oturum notları
        </h2>
        {notes.length ? (
          notes.map((n) => (
            <article key={n.id} className={styles.note}>
              <h3 className={ed.h3}>
                {brandLower(n.title)}
                {n.status === 'taslak' && <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>}
              </h3>
              <RichText source={n.body} className={ed.prose} />
              {n.author_credit && <p className="meta">{n.author_credit}</p>}
            </article>
          ))
        ) : (
          <p className={ed.empty}>bu gecenin notları henüz yazılmadı.</p>
        )}
      </section>

      <section className={ed.section} aria-labelledby="tartisma">
        <h2 id="tartisma" className={ed.h2}>
          tartışmaya bırakılanlar
        </h2>
        {afterQuestions.length === 0 && <p className={ed.empty}>soru eklenmedi.</p>}
        {afterQuestions.map((q) => (
          <article key={q.id} className={styles.question}>
            <p className={styles.questionText}>{q.body}</p>
            <Thread
              items={contributions}
              parentId={null}
              viewer={viewer}
              filmId={film.id}
              questionId={q.id}
              path={path}
              open={afterVisible}
            />
            {afterVisible && (
              <details className={styles.add}>
                <summary>düşünceni ekle</summary>
                <ContributionForm filmId={film.id} questionId={q.id} parentId={null} path={path} label="düşüncen" />
              </details>
            )}
          </article>
        ))}
      </section>

      {after.length > 0 && (
        <section className={ed.section} aria-labelledby="ileri">
          <h2 id="ileri" className={ed.h2}>
            ileri okuma
          </h2>
          {after.map((r, i) => (
            <ResourceEntry key={r.id} r={r} index={i + 1} total={after.length} mark={marks.get(r.id)} path={path} compact />
          ))}
        </section>
      )}
    </div>
  );
}
