import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/desk/Desk.module.css';
import { formatEventDate, nowMs } from '@/lib/dates';
import { requireStaff } from '@/server/auth/viewer';
import { mfaStatus } from '@/server/auth/mfa';
import { deskEvents, deskQueue, deskSummary, type QueueItem } from '@/server/dal/desk';
import { programLabel } from '@/lib/text';

export const metadata: Metadata = { title: 'masa' };

function reasons(q: QueueItem): [string, 'pillBad' | 'pillWarn' | ''][] {
  const out: [string, 'pillBad' | 'pillWarn' | ''][] = [];
  if (q.link_report_count > 0) out.push([`üye bildirdi (${q.link_report_count})`, 'pillBad']);
  if (q.review_note) out.push(['açık soru', 'pillWarn']);
  if (q.link_status === 'kirik') out.push(['bağlantı kırık', 'pillBad']);
  if (q.link_status === 'hata') out.push(['bağlantı yanıtı belirsiz', 'pillWarn']);
  if (!q.approved_at) out.push(['onay bekliyor', '']);
  if (q.status === 'taslak') out.push(['taslak', '']);
  return out;
}

export default async function DeskHome() {
  const viewer = await requireStaff();
  const [summary, events, mfa, queue] = await Promise.all([
    deskSummary(viewer),
    deskEvents(viewer),
    viewer.isAdmin ? mfaStatus(viewer.id) : null,
    deskQueue(viewer),
  ]);
  const upcoming = events
    .filter((e) => e.starts_at.getTime() > nowMs() - 6 * 3600e3 && e.status !== 'taslak')
    .at(-1);

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>masa</h1>
        <span className="meta">
          {viewer.role === 'editor'
            ? 'editör: içerik ve taslaklar'
            : viewer.mfaFresh
              ? 'yönetici · ikinci doğrulama açık'
              : 'yönetici'}
        </span>
      </div>

      {viewer.isAdmin && !mfa?.enrolled && (
        <div className={`${styles.panel} ${styles.panelWarn}`}>
          <h2>ikinci doğrulama kurulmadı</h2>
          <p>üyeler, konum ve davet işlemleri için bir doğrulama uygulaması gerekir.</p>
          <p>
            <Link href="/masa/guvenlik">şimdi kur</Link>
          </p>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className="meta">film</span>
          <strong>{summary.films}</strong>
        </div>
        <div className={styles.stat}>
          <span className="meta">taslak kaynak</span>
          <strong>{summary.drafts}</strong>
        </div>
        <div className={styles.stat}>
          <span className="meta">sorunlu bağlantı</span>
          <strong>{summary.broken}</strong>
        </div>
        <div className={styles.stat}>
          <span className="meta">denetlenmemiş</span>
          <strong>{summary.unchecked}</strong>
        </div>
      </div>

      {upcoming && (
        <div className={styles.panel}>
          <h2>sıradaki gece</h2>
          <p>
            {upcoming.number}. film gecesi · {upcoming.film_title ?? '—'} ·{' '}
            {formatEventDate(upcoming.starts_at)}
          </p>
          <p className="meta">
            {upcoming.invited} davetli · {upcoming.yes} geliyorum
          </p>
          <p>
            <Link href={viewer.isAdmin ? `/masa/geceler/${upcoming.id}` : '/masa/geceler'}>
              geceyi yönet
            </Link>
          </p>
        </div>
      )}

      <section className={styles.panel} aria-labelledby="kuyruk">
        <h2 id="kuyruk">editör kuyruğu</h2>
        {queue.length === 0 ? (
          <p className="meta">bekleyen iş yok.</p>
        ) : (
          <ul className={styles.items}>
            {queue.map((q) => (
              <li key={q.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <Link href={`/masa/kaynaklar/${q.id}`}>{q.heading ?? q.title_original}</Link>
                  {reasons(q).map(([text, tone]) => (
                    <span key={text} className={`${styles.pill} ${tone ? styles[tone] : ''}`}>
                      {text}
                    </span>
                  ))}
                </div>
                <p className="meta">
                  {programLabel(q.program_no, q.film_title)}
                  {q.review_note ? ` · ${q.review_note}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="meta">
          sıra: üye bildirimi, açık soru, sorunlu bağlantı, insan onayı bekleyen kaynak. hiçbiri
          kendiliğinden düzelmez; kararı sen verirsin.
        </p>
      </section>

      <div className={styles.panel}>
        <h2>tipografi denetimi</h2>
        <div className={styles.specimen} lang="tr">
          <p>bağlık.society — Ğ ğ İ ı Ş ş Ç ç Ö ö Ü ü</p>
          <p>Kore-eda’nın “hafıza” üzerine söyledikleri; Ryūsuke Hamaguchi</p>
          <p>Işık, gölge, İstanbul’da bir pazar akşamı — 27 eylül 2026 · 19.30</p>
          <p>002 / canavar · 001 / drive my car · ÇAĞLA AYTAÇ DURSUN</p>
        </div>
      </div>
    </>
  );
}
