import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/desk/Desk.module.css';
import { formatEventDate, nowMs } from '@/lib/dates';
import { requireStaff } from '@/server/auth/viewer';
import { mfaStatus } from '@/server/auth/mfa';
import { deskEvents, deskSummary } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa' };

export default async function DeskHome() {
  const viewer = await requireStaff();
  const [summary, events, mfa] = await Promise.all([
    deskSummary(viewer),
    deskEvents(viewer),
    viewer.isAdmin ? mfaStatus(viewer.id) : null,
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
