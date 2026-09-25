import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventForm, LocationForm, NotifyForm } from '@/components/desk/EventForms';
import styles from '@/components/desk/Desk.module.css';
import ui from '@/components/ui/ui.module.css';
import { dateToIstanbulLocal, formatEventDate, formatShort, nowMs } from '@/lib/dates';
import { programLabel } from '@/lib/text';
import { inviteesAction, releaseLocationAction } from '@/server/actions/desk';
import { requireAdmin } from '@/server/auth/viewer';
import { deskEvent, deskFilms } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · gece' };

const RSVP: Record<string, string> = { geliyorum: 'geliyorum', gelemiyorum: 'gelemiyorum', belirsiz: 'belli değil' };

export default async function DeskEventPage(props: PageProps<'/masa/geceler/[id]'>) {
  const viewer = await requireAdmin();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [data, films] = await Promise.all([deskEvent(viewer, id), deskFilms(viewer)]);
  if (!data) notFound();
  const { event, filmIds, priv, invitees, members } = data;
  const now = nowMs();
  const effective = priv?.released_at ?? priv?.release_at ?? null;
  const releasedNow = !!effective && effective.getTime() <= now;
  const counts = {
    davetli: invitees.filter((i) => i.status === 'davetli').length,
    geliyorum: invitees.filter((i) => i.status === 'davetli' && i.rsvp === 'geliyorum').length,
    gelemiyorum: invitees.filter((i) => i.status === 'davetli' && i.rsvp === 'gelemiyorum').length,
    bekleyen: invitees.filter((i) => i.status === 'davetli' && !i.rsvp).length,
  };

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{event.number ? `${event.number}. film gecesi` : 'gece'}</h1>
        {event.number && <Link href={`/geceler/${event.number}`}>davetli görünümü</Link>}
      </div>
      <p className="meta">{formatEventDate(event.starts_at)}</p>

      <section className={styles.panel} aria-labelledby="gece-bilgi">
        <h2 id="gece-bilgi">gece</h2>
        <EventForm
          films={films.map((f) => ({ id: f.id, label: programLabel(f.program_no, f.title) }))}
          values={{
            id: event.id,
            number: event.number,
            title: event.title,
            starts_at: dateToIstanbulLocal(event.starts_at),
            ends_at: dateToIstanbulLocal(event.ends_at),
            status: event.status,
            status_note: event.status_note,
            rsvp_deadline: dateToIstanbulLocal(event.rsvp_deadline),
            capacity: event.capacity,
            location_public_note: event.location_public_note,
            guest_list_visible: event.guest_list_visible,
            film_ids: filmIds,
          }}
        />
      </section>

      <section className={styles.panel} aria-labelledby="konum">
        <h2 id="konum">konum</h2>
        <p>
          durum:{' '}
          {!priv?.location_text ? (
            <span className={`${styles.pill} ${styles.pillWarn}`}>konum girilmedi</span>
          ) : releasedNow ? (
            <span className={`${styles.pill} ${styles.pillOk}`}>açık · {priv.release_audience === 'katilanlar' ? 'geliyorum diyenler' : 'tüm davetliler'}</span>
          ) : effective ? (
            <span className={styles.pill}>zamanlandı · {formatShort(effective)}</span>
          ) : (
            <span className={styles.pill}>gizli</span>
          )}
        </p>
        <p className={ui.hint}>
          konum yalnızca açılış zamanı geldiğinde ve yalnızca uygun davetlilere veritabanı fonksiyonu üzerinden verilir.
          öncesinde sayfa, takvim dosyası, davetiye ve e-postada yer almaz. konum girilmeden açılırsa davetliler “konum
          bilgisi henüz paylaşılmadı” görür.
        </p>
        {priv && (
          <LocationForm
            values={{
              eventId: event.id,
              location_text: priv.location_text,
              location_url: priv.location_url,
              location_directions: priv.location_directions,
              release_at: dateToIstanbulLocal(priv.release_at),
              release_audience: priv.release_audience,
              include_in_email: priv.include_in_email,
              admin_note: priv.admin_note,
            }}
          />
        )}
        <div className={ui.row}>
          <form action={releaseLocationAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="op" value="release" />
            <button className={`${ui.button} ${ui.small}`}>şimdi aç</button>
          </form>
          {effective && (
            <form action={releaseLocationAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="op" value="withdraw" />
              <button className={`${ui.button} ${ui.small} ${ui.danger}`}>paylaşımı geri çek</button>
            </form>
          )}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="davetliler">
        <h2 id="davetliler">davetliler</h2>
        <p className="meta">
          {counts.davetli} davetli · {counts.geliyorum} geliyorum · {counts.gelemiyorum} gelemiyorum · {counts.bekleyen} yanıt bekleniyor
        </p>
        {invitees.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>üye</th>
                  <th>katılım</th>
                  <th>not</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitees.map((i) => (
                  <tr key={i.member_id}>
                    <td>
                      {i.display_name}
                      {i.member_status !== 'active' && <span className="meta"> · {i.member_status === 'invited' ? 'henüz girmedi' : 'iptal'}</span>}
                    </td>
                    <td>{i.status === 'iptal' ? 'davet geri alındı' : i.rsvp ? RSVP[i.rsvp] : '—'}</td>
                    <td>{i.rsvp_note ?? ''}</td>
                    <td>
                      <form action={inviteesAction}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="memberId" value={i.member_id} />
                        <input type="hidden" name="op" value={i.status === 'davetli' ? 'cancel' : 'restore'} />
                        <button className={styles.tool}>{i.status === 'davetli' ? 'daveti geri al' : 'yeniden davet et'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {members.length > 0 && (
          <form action={inviteesAction} className={styles.grid}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="op" value="add" />
            <fieldset className={ui.fieldset}>
              <legend>davet et</legend>
              <div className={ui.segmented}>
                {members.map((m) => (
                  <label key={m.id}>
                    <input type="checkbox" name="memberIds" value={m.id} /> {m.display_name}
                  </label>
                ))}
              </div>
            </fieldset>
            <p>
              <button className={`${ui.button} ${ui.small}`}>seçilenleri davet et</button>
            </p>
          </form>
        )}
        <form action={inviteesAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="op" value="all" />
          <button className={styles.tool}>tüm aktif üyeleri davet et</button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="bildirim">
        <h2 id="bildirim">bildirimler</h2>
        <p className={ui.hint}>
          elle tetiklenir. e-posta sağlayıcısı tanımlı değilse hiçbir şey gönderilmez ve her kişi için “sağlayıcı yok”
          kaydı düşülür; bu durumda konumu davetlilere kendin iletmelisin.
        </p>
        <NotifyForm eventId={event.id} kind="konum" label="konum açıldı bildirimi gönder" />
        <NotifyForm eventId={event.id} kind="hatirlatma" label="hatırlatma gönder" />
      </section>
    </>
  );
}
