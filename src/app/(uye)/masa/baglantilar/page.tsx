import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatShort } from '@/lib/dates';
import { hostOf, programNo } from '@/lib/text';
import { checkLinkAction } from '@/server/actions/desk';
import { requireStaff } from '@/server/auth/viewer';
import { linkHealth } from '@/server/dal/desk';
import { linkCheckEnabled } from '@/server/env';

export const metadata: Metadata = { title: 'masa · bağlantılar' };

const TEXT: Record<string, [string, string]> = {
  kirik: ['kırık', 'pillBad'],
  hata: ['belirsiz', 'pillWarn'],
  yonlendirme: ['yönlendiriyor', 'pillWarn'],
  denetlenmedi: ['denetlenmedi', ''],
  saglam: ['sağlam', 'pillOk'],
};

export default async function LinksPage() {
  const viewer = await requireStaff();
  const rows = await linkHealth(viewer);
  const enabled = linkCheckEnabled();
  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>bağlantılar</h1>
        {enabled ? (
          <form action={checkLinkAction}>
            <button className={`${ui.button} ${ui.small}`}>şimdi denetle (en çok 15)</button>
          </form>
        ) : (
          <span className="meta">otomatik denetim bu kurulumda kapalı (LINK_CHECK=off)</span>
        )}
      </div>
      <p className="meta">
        haftada bir otomatik denetlenir. siteler arasında bekleyerek, tek tek ve kısa zaman aşımıyla
        istek atılır. sorunlu bağlantılar silinmez. 401/403/429 yanıtları çoğu zaman abonelik ya da
        bot duvarıdır; “belirsiz” sayılır.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>durum</th>
              <th>kaynak</th>
              <th>site</th>
              <th>son denetim</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [label, pill] = TEXT[r.link_status] ?? ['?', ''];
              return (
                <tr key={r.id}>
                  <td>
                    <span className={`${styles.pill} ${pill ? styles[pill] : ''}`}>{label}</span>
                    {r.link_http_status && <span className="meta"> {r.link_http_status}</span>}
                  </td>
                  <td>
                    <Link href={`/masa/kaynaklar/${r.id}`}>{r.heading ?? r.title_original}</Link>
                    <div className="meta">{programNo(r.program_no)}</div>
                  </td>
                  <td>{hostOf(r.url)}</td>
                  <td className="meta">
                    {r.link_checked_at ? formatShort(r.link_checked_at) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
