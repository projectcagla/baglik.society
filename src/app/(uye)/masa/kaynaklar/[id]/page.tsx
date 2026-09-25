import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResourceForm } from '@/components/desk/ResourceForm';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatShort } from '@/lib/dates';
import { deskError } from '@/lib/desk-errors';
import { publishChecklist } from '@/lib/publish-check';
import { programLabel } from '@/lib/text';
import {
  approveResourceAction,
  checkLinkAction,
  deleteResourceAction,
  resourceStatusAction,
} from '@/server/actions/desk';
import { requireStaff } from '@/server/auth/viewer';
import { deskResource } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · kaynak' };

export default async function EditResource(props: PageProps<'/masa/kaynaklar/[id]'>) {
  const viewer = await requireStaff();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await deskResource(viewer, id);
  if (!data) notFound();
  const { resource: r, checks } = data;
  const search = await props.searchParams;
  const isNew = search.yeni === '1';
  const refused = deskError(search.hata);
  const checklist = publishChecklist(r);

  return (
    <>
      <p className="meta">
        <Link href={`/masa/filmler/${r.film_id}`}>{programLabel(r.program_no, r.film_title)}</Link>{' '}
        · kaynak
      </p>
      <div className={styles.head}>
        <h1 className={styles.title}>{r.heading ?? r.title_original}</h1>
        <span
          className={`${styles.pill} ${r.status === 'yayinda' ? styles.pillOk : styles.pillWarn}`}
        >
          {r.status === 'yayinda' ? 'yayında' : 'taslak'}
        </span>
      </div>
      {isNew && (
        <p className={ui.status}>kaynak taslak olarak oluşturuldu. hazır olduğunda yayımla.</p>
      )}
      {refused && (
        <p className={`${ui.status} ${ui.statusBad}`} role="alert">
          {refused}
        </p>
      )}

      <div className={ui.row}>
        <form action={resourceStatusAction}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="on" value={r.status === 'yayinda' ? '0' : '1'} />
          <button className={`${ui.button} ${ui.small} ${ui.primary}`}>
            {r.status === 'yayinda' ? 'taslağa al' : 'yayımla'}
          </button>
        </form>
        <Link
          className={`${ui.button} ${ui.small}`}
          href={`/filmler/${r.film_slug}/${r.layer === 'once' ? 'okuma' : 'sonra'}#k-${r.id.slice(0, 8)}`}
        >
          önizle
        </Link>
        {r.url && (
          <form action={checkLinkAction}>
            <input type="hidden" name="id" value={r.id} />
            <button className={`${ui.button} ${ui.small}`}>bağlantıyı denetle</button>
          </form>
        )}
      </div>

      <section className={styles.panel} aria-labelledby="yayin-oncesi">
        <h2 id="yayin-oncesi">yayın öncesi denetim</h2>
        <ul className={styles.checklist}>
          {checklist.map((c) => (
            <li key={c.key} data-ok={c.ok || undefined}>
              <span aria-hidden="true">{c.ok ? '✓' : '○'}</span>
              <span>
                {c.label}
                {!c.ok && <span className={ui.hint}> — {c.fix}</span>}
                <span className="visually-hidden">{c.ok ? ' (tamam)' : ' (eksik)'}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.approval}>
          <p>
            son insan onayı:{' '}
            {r.approved_at ? (
              <strong>{formatShort(r.approved_at)}</strong>
            ) : (
              <span className={`${styles.pill} ${styles.pillWarn}`}>onay bekliyor</span>
            )}
            {r.link_report_count > 0 && (
              <span className={`${styles.pill} ${styles.pillBad}`}>
                üye bildirimi: bağlantı açılmıyor ({r.link_report_count})
              </span>
            )}
          </p>
          <form action={approveResourceAction}>
            <input type="hidden" name="id" value={r.id} />
            <button className={`${ui.button} ${ui.small}`}>
              künyeyi ve bağlantıyı kontrol ettim
            </button>
          </form>
          <p className={ui.hint}>
            bağlantıyı açıp başlık, yazar, yayın ve tarihi kaynağın kendisinden doğruladıysan
            onayla. bağlantı ya da künye değişirse onay kendiliğinden düşer.
            {r.provenance && <> köken: {r.provenance}.</>}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <ResourceForm filmId={r.film_id} layer={r.layer} resource={r} />
      </section>

      {r.url && (
        <section className={styles.panel} aria-labelledby="denetim">
          <h2 id="denetim">bağlantı denetimi</h2>
          {checks.length === 0 ? (
            <p className="meta">henüz denetlenmedi.</p>
          ) : (
            <ul className={styles.items}>
              {checks.map((c) => (
                <li key={c.checked_at.toISOString()} className={styles.item}>
                  <span>
                    {formatShort(c.checked_at)} · {c.ok ? 'yanıt verdi' : 'sorun'} ·{' '}
                    {c.http_status ?? c.error ?? '—'}
                  </span>
                  {c.final_url && c.final_url !== r.url && (
                    <span className="meta">yönlendirdi: {c.final_url}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className={ui.hint}>sorunlu bağlantılar silinmez; düzeltmek senin kararın.</p>
        </section>
      )}

      <section className={`${styles.panel} ${styles.panelWarn}`}>
        <form action={deleteResourceAction} className={ui.row}>
          <input type="hidden" name="id" value={r.id} />
          <button className={`${ui.button} ${ui.small} ${ui.danger}`}>kaynağı sil</button>
          <span className={ui.hint}>kalıcıdır; yalnızca gizlemek için taslağa al.</span>
        </form>
      </section>
    </>
  );
}
