import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilmForm } from '@/components/desk/FilmForm';
import { NoteForm } from '@/components/desk/NoteForm';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { deskError } from '@/lib/desk-errors';
import { brandLower, programLabel, SECTION_LABELS, SPOILER_LABELS } from '@/lib/text';
import {
  deleteFilmAction,
  filmPublicationAction,
  moveResourceAction,
  noteStatusAction,
  questionAction,
  resourceStatusAction,
} from '@/server/actions/desk';
import { requireStaff } from '@/server/auth/viewer';
import { deskFilm } from '@/server/dal/desk';
import type { ResourceRow } from '@/server/dal/films';

export const metadata: Metadata = { title: 'masa · film' };

const LINK_PILL: Record<string, string> = {
  saglam: 'pillOk',
  yonlendirme: 'pillWarn',
  kirik: 'pillBad',
  hata: 'pillWarn',
  denetlenmedi: '',
};
const LINK_TEXT: Record<string, string> = {
  saglam: 'bağlantı sağlam',
  yonlendirme: 'yönlendiriyor',
  kirik: 'kırık',
  hata: 'yanıt belirsiz',
  denetlenmedi: 'denetlenmedi',
};

function Hidden(props: Record<string, string>) {
  return (
    <>
      {Object.entries(props).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

function ResourceItem({ r }: { r: ResourceRow }) {
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <Link href={`/masa/kaynaklar/${r.id}`}>{r.heading ?? r.title_original}</Link>
        <span
          className={`${styles.pill} ${r.status === 'yayinda' ? styles.pillOk : styles.pillWarn}`}
        >
          {r.status === 'yayinda' ? 'yayında' : 'taslak'}
        </span>
        {r.url && (
          <span className={`${styles.pill} ${styles[LINK_PILL[r.link_status] ?? ''] ?? ''}`}>
            {LINK_TEXT[r.link_status]}
          </span>
        )}
      </div>
      <p className="meta">
        {SECTION_LABELS[r.section]} · {[r.publication, r.author].filter(Boolean).join(' · ')}
        {SPOILER_LABELS[r.spoiler_level] ? ` · ${SPOILER_LABELS[r.spoiler_level]}` : ''}
      </p>
      <div className={styles.tools}>
        <Link href={`/masa/kaynaklar/${r.id}`} className={styles.tool}>
          düzenle
        </Link>
        <form action={resourceStatusAction}>
          <Hidden id={r.id} on={r.status === 'yayinda' ? '0' : '1'} />
          <button className={styles.tool}>
            {r.status === 'yayinda' ? 'taslağa al' : 'yayımla'}
          </button>
        </form>
        <form action={moveResourceAction}>
          <Hidden id={r.id} dir="up" />
          <button className={styles.tool} aria-label="yukarı taşı">
            ↑
          </button>
        </form>
        <form action={moveResourceAction}>
          <Hidden id={r.id} dir="down" />
          <button className={styles.tool} aria-label="aşağı taşı">
            ↓
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function DeskFilmPage(props: PageProps<'/masa/filmler/[id]'>) {
  const viewer = await requireStaff();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await deskFilm(viewer, id);
  if (!data) notFound();
  const { film, resources, questions, notes } = data;
  const before = resources.filter((r) => r.layer === 'once');
  const after = resources.filter((r) => r.layer === 'sonra');
  const refused = deskError((await props.searchParams).hata);

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{programLabel(film.program_no, film.title)}</h1>
        <span className={ui.row}>
          <Link href={`/filmler/${film.slug}`}>sayfaya git</Link>
          <Link href={`/filmler/${film.slug}?gorunum=uye`}>üye gibi gör</Link>
          <a href={`/masa/filmler/${film.id}/markdown`} download>
            markdown
          </a>
        </span>
      </div>

      {refused && (
        <p className={`${ui.status} ${ui.statusBad}`} role="alert">
          {refused}
        </p>
      )}

      <section className={styles.panel} aria-labelledby="yayin">
        <h2 id="yayin">yayın</h2>
        <div className={styles.cols2}>
          <div className={styles.grid}>
            <p>
              film sayfası ve “önce” katmanı:{' '}
              <span
                className={`${styles.pill} ${film.published_at ? styles.pillOk : styles.pillWarn}`}
              >
                {film.published_at ? 'yayında' : 'taslak'}
              </span>
            </p>
            <form action={filmPublicationAction}>
              <Hidden id={film.id} layer="film" on={film.published_at ? '0' : '1'} />
              <button className={`${ui.button} ${ui.small}`}>
                {film.published_at ? 'yayından kaldır' : 'yayımla'}
              </button>
            </form>
          </div>
          <div className={styles.grid}>
            <p>
              “sonra” katmanı (spoiler, notlar, tartışma):{' '}
              <span className={`${styles.pill} ${film.after_published_at ? styles.pillOk : ''}`}>
                {film.after_published_at ? 'açık' : 'kapalı'}
              </span>
            </p>
            <form action={filmPublicationAction}>
              <Hidden id={film.id} layer="after" on={film.after_published_at ? '0' : '1'} />
              <button className={`${ui.button} ${ui.small}`}>
                {film.after_published_at ? 'sonrasını kapat' : 'sonrasını aç'}
              </button>
            </form>
            <p className={ui.hint}>
              kapalıyken sunucu bu katmanı üyelere hiç göndermez; yalnızca masa görür.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="kunye">
        <h2 id="kunye">künye</h2>
        <FilmForm film={film} />
      </section>

      {(['once', 'sonra'] as const).map((layer) => {
        const list = layer === 'once' ? before : after;
        return (
          <section key={layer} className={styles.panel} aria-labelledby={`k-${layer}`}>
            <div className={styles.head}>
              <h2 id={`k-${layer}`}>{layer === 'once' ? 'önce · seçki' : 'sonra · ileri okuma'}</h2>
              <Link
                href={`/masa/kaynaklar/yeni?film=${film.id}&layer=${layer}`}
                className={`${ui.button} ${ui.small}`}
              >
                kaynak ekle
              </Link>
            </div>
            {list.length ? (
              <ul className={styles.items}>
                {list.map((r) => (
                  <ResourceItem key={r.id} r={r} />
                ))}
              </ul>
            ) : (
              <p className="meta">kaynak yok.</p>
            )}
          </section>
        );
      })}

      <section className={styles.panel} aria-labelledby="sorular">
        <h2 id="sorular">sorular</h2>
        <ul className={styles.items}>
          {questions.map((q) => (
            <li key={q.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span>{q.body}</span>
                <span className={styles.pill}>{q.layer === 'once' ? 'önce' : 'sonra'}</span>
                <span
                  className={`${styles.pill} ${q.status === 'yayinda' ? styles.pillOk : styles.pillWarn}`}
                >
                  {q.status === 'yayinda' ? 'yayında' : 'taslak'}
                </span>
              </div>
              <div className={styles.tools}>
                <form action={questionAction}>
                  <Hidden
                    filmId={film.id}
                    id={q.id}
                    op={q.status === 'yayinda' ? 'unpublish' : 'publish'}
                  />
                  <button className={styles.tool}>
                    {q.status === 'yayinda' ? 'taslağa al' : 'yayımla'}
                  </button>
                </form>
                <form action={questionAction}>
                  <Hidden filmId={film.id} id={q.id} op="delete" />
                  <button className={`${styles.tool} ${styles.toolDanger}`}>sil</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={questionAction} className={styles.grid}>
          <Hidden filmId={film.id} op="add" />
          <div className={styles.cols2}>
            <div className={ui.field}>
              <label htmlFor="q-body" className={ui.label}>
                yeni soru
              </label>
              <input id="q-body" name="body" className={ui.input} maxLength={400} required />
            </div>
            <div className={ui.field}>
              <label htmlFor="q-layer" className={ui.label}>
                katman
              </label>
              <select id="q-layer" name="layer" className={ui.select} defaultValue="sonra">
                <option value="once">önce (düşünmek için, spoiler yok)</option>
                <option value="sonra">sonra (tartışma)</option>
              </select>
            </div>
          </div>
          <p>
            <button className={`${ui.button} ${ui.small}`}>soruyu ekle (taslak)</button>
          </p>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="notlar">
        <h2 id="notlar">oturum notları · sonra katmanı</h2>
        {notes.map((n) => (
          <div key={n.id} className={styles.grid}>
            <div className={styles.itemHead}>
              <strong>{brandLower(n.title)}</strong>
              <span
                className={`${styles.pill} ${n.status === 'yayinda' ? styles.pillOk : styles.pillWarn}`}
              >
                {n.status === 'yayinda' ? 'yayında' : 'taslak'}
              </span>
              <form action={noteStatusAction}>
                <Hidden id={n.id} op={n.status === 'yayinda' ? 'unpublish' : 'publish'} />
                <button className={styles.tool}>
                  {n.status === 'yayinda' ? 'taslağa al' : 'yayımla'}
                </button>
              </form>
              <form action={noteStatusAction}>
                <Hidden id={n.id} op="delete" />
                <button className={`${styles.tool} ${styles.toolDanger}`}>sil</button>
              </form>
            </div>
            <NoteForm filmId={film.id} note={n} />
          </div>
        ))}
        <details>
          <summary className={styles.tool}>yeni not</summary>
          <NoteForm filmId={film.id} />
        </details>
      </section>

      {viewer.isAdmin && (
        <section className={`${styles.panel} ${styles.panelWarn}`} aria-labelledby="sil">
          <h2 id="sil">filmi sil</h2>
          <p className={ui.hint}>
            kaynakları, soruları ve notlarıyla birlikte kalıcı olarak silinir. arşiv için durumu
            “arşiv” yapmak genelde yeterlidir.
          </p>
          <form action={deleteFilmAction} className={ui.row}>
            <Hidden id={film.id} />
            <label className={ui.label} htmlFor="del-confirm">
              onay için “sil” yaz
            </label>
            <input
              id="del-confirm"
              name="confirm"
              className={ui.input}
              style={{ maxWidth: '8rem' }}
            />
            <button className={`${ui.button} ${ui.small} ${ui.danger}`}>sil</button>
          </form>
        </section>
      )}
    </>
  );
}
