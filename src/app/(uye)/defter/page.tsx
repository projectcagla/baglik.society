import type { Metadata } from 'next';
import Link from 'next/link';
import { JournalForm } from '@/components/member/JournalForm';
import ed from '@/components/member/Editorial.module.css';
import { formatDay } from '@/lib/dates';
import { programLabel } from '@/lib/text';
import { entryVisibilityAction } from '@/server/actions/member';
import { requireMember } from '@/server/auth/viewer';
import { listFilms, listSaved } from '@/server/dal/films';
import { listOwnEntries, listSharedEntries, type JournalEntry } from '@/server/dal/journal';

export const metadata: Metadata = { title: 'defter' };

const KIND: Record<string, string> = { beklenti: 'izlemeden önce', hatira: 'izledikten sonra', serbest: 'serbest' };

function Op({ id, op, children }: { id: string; op: string; children: React.ReactNode }) {
  return (
    <form action={entryVisibilityAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" className={ed.linkButton}>
        {children}
      </button>
    </form>
  );
}

function EntryMeta({ e }: { e: JournalEntry }) {
  return (
    <p className={ed.entryMeta}>
      <span>{formatDay(e.created_at)}</span>
      <span>{KIND[e.kind]}</span>
      {e.film_title && <span>{programLabel(e.program_no, e.film_title)}</span>}
    </p>
  );
}

export default async function JournalPage() {
  const viewer = await requireMember();
  const [own, shared, films, saved] = await Promise.all([
    listOwnEntries(viewer),
    listSharedEntries(viewer),
    listFilms(viewer),
    listSaved(viewer),
  ]);
  const filmOptions = films.filter((f) => f.published_at).map((f) => ({ id: f.id, label: programLabel(f.program_no, f.title) }));
  const others = shared.filter((e) => e.member_id !== viewer.id);

  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <h1 className={ed.h1}>defter</h1>
        <p className={ed.lede}>
          notların yalnızca sana görünür. istersen bir notu adınla ya da adsız olarak toplulukla paylaşabilir, sonra geri
          alabilirsin.
        </p>
        <p className={ed.muted}>
          notlar uçtan uca şifreli değildir: sunucuda saklanır ve veritabanına doğrudan erişimi olan bir teknik yönetici
          teknik olarak görebilir. uygulama içinde başka hiçbir üye ve yönetici özel notunu göremez.
        </p>
      </header>

      <section className={`${ed.section} ${ed.narrow}`} aria-labelledby="yeni-not">
        <h2 id="yeni-not" className={ed.h2}>
          yeni not
        </h2>
        <JournalForm films={filmOptions} />
      </section>

      <section className={ed.section} aria-labelledby="notlarim">
        <h2 id="notlarim" className={ed.kicker}>
          notların
        </h2>
        {own.length === 0 ? (
          <p className={ed.empty}>henüz not yok.</p>
        ) : (
          <ul role="list" className={ed.list}>
            {own.map((e) => (
              <li key={e.id} className={ed.entry}>
                <EntryMeta e={e} />
                <p className={ed.entryBody}>{e.body}</p>
                <p className={ed.entryMeta}>
                  {e.visibility === 'paylasildi'
                    ? `paylaşıldı · ${e.attribution === 'anonim' ? 'adsız' : 'adınla'}${e.moderation === 'gizlendi' ? ' · moderatör gizledi' : ''}`
                    : 'yalnızca sen'}
                </p>
                <div className={ed.entryTools}>
                  {e.visibility === 'ozel' ? (
                    <>
                      <Op id={e.id} op="share-named">
                        adımla paylaş
                      </Op>
                      <Op id={e.id} op="share-anon">
                        adsız paylaş
                      </Op>
                    </>
                  ) : (
                    <Op id={e.id} op="unshare">
                      paylaşımı geri al
                    </Op>
                  )}
                  <Op id={e.id} op="delete">
                    sil
                  </Op>
                </div>
                <details className={ed.details}>
                  <summary>düzenle</summary>
                  <JournalForm films={filmOptions} entry={{ id: e.id, filmId: e.film_id, kind: e.kind, body: e.body }} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ed.section} aria-labelledby="ortak">
        <h2 id="ortak" className={ed.kicker}>
          paylaşılanlar
        </h2>
        {others.length === 0 ? (
          <p className={ed.empty}>henüz paylaşılan bir not yok.</p>
        ) : (
          <ul role="list" className={ed.list}>
            {others.map((e) => (
              <li key={e.id} className={ed.entry}>
                <EntryMeta e={e} />
                <p className={ed.entryBody}>{e.body}</p>
                <p className={ed.entryMeta}>{e.attribution === 'anonim' ? 'adsız' : e.attribution_name}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ed.section} aria-labelledby="kaydedilenler">
        <h2 id="kaydedilenler" className={ed.kicker}>
          kaydedilenler
        </h2>
        {saved.length === 0 ? (
          <p className={ed.empty}>okuma odasında “kaydet” dediğin kaynaklar burada durur.</p>
        ) : (
          <ul role="list" className={ed.list}>
            {saved.map((s) => (
              <li key={s.resource_id} className={ed.entry}>
                <Link href={`/filmler/${s.film_slug}/okuma#k-${s.resource_id.slice(0, 8)}`}>{s.heading ?? s.title_original}</Link>
                <p className={ed.entryMeta}>
                  <span>{s.publication}</span>
                  <span>{programLabel(s.program_no, s.film_title)}</span>
                  {s.read_at && <span>okundu</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
