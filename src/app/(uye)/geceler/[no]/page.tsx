import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventHero } from '@/components/member/EventHero';
import { RsvpForm } from '@/components/member/RsvpForm';
import styles from '@/components/member/Event.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatEventDate, isPast } from '@/lib/dates';
import { requireMember } from '@/server/auth/viewer';
import { getEventByNumber } from '@/server/dal/events';

async function load(props: PageProps<'/geceler/[no]'>) {
  const viewer = await requireMember();
  const no = Number((await props.params).no);
  if (!Number.isInteger(no) || no < 1) return { viewer, view: null };
  return { viewer, view: await getEventByNumber(viewer, no) };
}

export async function generateMetadata(props: PageProps<'/geceler/[no]'>): Promise<Metadata> {
  const { view } = await load(props);
  return { title: view?.event.number ? `${view.event.number}. film gecesi` : 'gece' };
}

export default async function EventPage(props: PageProps<'/geceler/[no]'>) {
  const { view } = await load(props);
  if (!view) notFound();
  const { event, invite, guests } = view;
  const invited = invite?.status === 'davetli';
  const deadlinePassed = isPast(event.rsvp_deadline);
  const closed =
    event.status === 'iptal'
      ? 'bu gece iptal edildi.'
      : event.status === 'tamamlandi'
        ? 'bu gece tamamlandı.'
        : deadlinePassed
          ? 'katılım bildirme süresi doldu.'
          : null;

  return (
    <div className={styles.layout}>
      <EventHero view={view} variant="event" />

      {invited ? (
        <section id="katilim" className={styles.panel} aria-labelledby="katilim-baslik">
          <h2 id="katilim-baslik">katılımın</h2>
          {event.rsvp_deadline && !deadlinePassed && (
            <p className={styles.fine}>son bildirim: {formatEventDate(event.rsvp_deadline)}</p>
          )}
          <RsvpForm eventId={event.id} current={invite?.rsvp ?? null} note={invite?.rsvp_note ?? null} closed={closed} />
          <p className={styles.fine}>
            katılım bilgin yalnızca yöneticilerle paylaşılır. konum açıldığında, katılımını bildiren davetliler görür.
          </p>
        </section>
      ) : (
        <section className={styles.panel}>
          <p className={styles.fine}>bu geceye davetli görünmüyorsun; ayrıntılar yalnızca davetlilere açık.</p>
        </section>
      )}

      {guests && guests.length > 0 && (
        <section className={styles.panel} aria-labelledby="gelenler">
          <h2 id="gelenler">gelenler</h2>
          <ul role="list" className={styles.guests}>
            {guests.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {invited && (
        <section className={styles.panel} aria-labelledby="takvim">
          <h2 id="takvim">takvim ve davetiye</h2>
          <div className={ui.row}>
            <a className={ui.button} href={`/geceler/${event.number}/takvim`} download>
              takvime ekle (.ics)
            </a>
            <Link className={ui.button} href={`/geceler/${event.number}/davetiye`}>
              davetiye görselleri
            </Link>
          </div>
          <p className={styles.fine}>
            takvim dosyası, kaydettiğin takvim uygulamasına (ör. google, apple) kopyalanır ve oradaki gizlilik
            kurallarına tabidir. konum henüz paylaşılmadıysa dosyada konum yoktur; paylaşıldıktan sonra dosyayı yeniden
            indirmen gerekir.
          </p>
        </section>
      )}
    </div>
  );
}
