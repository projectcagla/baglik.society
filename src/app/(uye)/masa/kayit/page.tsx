import type { Metadata } from 'next';
import styles from '@/components/desk/Desk.module.css';
import { formatShort } from '@/lib/dates';
import { requireAdmin } from '@/server/auth/viewer';
import { auditLog, deliveries } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · kayıt' };

export default async function AuditPage() {
  const viewer = await requireAdmin();
  const [log, sent] = await Promise.all([auditLog(viewer), deliveries(viewer)]);
  return (
    <>
      <h1 className={styles.title}>kayıt</h1>
      <section className={styles.panel} aria-labelledby="teslimat">
        <h2 id="teslimat">bildirim teslimatları</h2>
        <p className="meta">
          “saglayici_yok”: e-posta sağlayıcısı tanımlı değil, hiçbir şey gönderilmedi. kurtarma
          istekleri de burada görünür.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>zaman</th>
                <th>tür</th>
                <th>üye</th>
                <th>durum</th>
              </tr>
            </thead>
            <tbody>
              {sent.map((d) => (
                <tr key={d.id}>
                  <td className="meta">{formatShort(d.created_at)}</td>
                  <td>{d.kind}</td>
                  <td>{d.member ?? '—'}</td>
                  <td>
                    {d.status}
                    {d.error && <span className="meta"> · {d.error}</span>}
                  </td>
                </tr>
              ))}
              {sent.length === 0 && (
                <tr>
                  <td colSpan={4}>kayıt yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="islem">
        <h2 id="islem">işlem kaydı</h2>
        <p className="meta">
          kodlar, adresler ve not içerikleri kayda yazılmaz; yalnızca kim, ne zaman, ne yaptı.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>zaman</th>
                <th>kim</th>
                <th>işlem</th>
                <th>hedef</th>
              </tr>
            </thead>
            <tbody>
              {log.map((a) => (
                <tr key={a.id}>
                  <td className="meta">{formatShort(a.at)}</td>
                  <td>{a.actor ?? 'sistem'}</td>
                  <td>{a.action}</td>
                  <td className="meta">
                    {a.target_type} {a.target_id?.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
