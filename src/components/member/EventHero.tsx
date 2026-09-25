import Link from 'next/link';
import type { EventView } from '@/server/dal/events';
import { formatDay, formatTime, formatWeekday, relativeDay } from '@/lib/dates';
import { brandLower, programNo } from '@/lib/text';
import ui from '@/components/ui/ui.module.css';
import { LocationLine } from './LocationLine';
import styles from './Room.module.css';

const RSVP_TEXT: Record<string, string> = {
  geliyorum: 'geliyorum',
  gelemiyorum: 'gelemiyorum',
  belirsiz: 'henüz belli değil',
};

/**
 * The invitation rhythm (sparse serif, short rules, lowercase) used by the
 * room and the event page. Location is whatever the database released.
 */
export function EventHero({ view, variant }: { view: EventView; variant: 'room' | 'event' }) {
  const { event, films, invite, location } = view;
  const film = films[0];
  const nightLabel = event.title
    ? brandLower(event.title)
    : event.number
      ? `${event.number}. film gecesi`
      : 'film gecesi';
  const Heading = variant === 'room' ? 'h1' : 'h1';

  return (
    <section className={styles.next} aria-labelledby="gece-baslik">
      <p className={styles.kicker}>
        {variant === 'room' ? `sıradaki gece · ${nightLabel}` : nightLabel}
      </p>
      {film && <p className={styles.no}>{programNo(film.program_no)}</p>}
      <Heading id="gece-baslik" className={styles.title}>
        {film ? brandLower(film.title) : nightLabel}
      </Heading>
      {film?.director && <p className={styles.director}>{brandLower(film.director)}</p>}
      {films.length > 1 && (
        <p className={styles.director}>
          +{' '}
          {films
            .slice(1)
            .map((f) => brandLower(f.title))
            .join(', ')}
        </p>
      )}
      {(event.status === 'ertelendi' || event.status === 'iptal') && (
        <p className={styles.status}>
          {event.status === 'iptal' ? 'iptal edildi' : 'ertelendi'}
          {event.status_note ? ` — ${event.status_note}` : ''}
        </p>
      )}
      <hr className={styles.rule} />
      <p className={styles.when}>
        <time dateTime={event.starts_at.toISOString()}>
          <span className={styles.nowrap}>{formatDay(event.starts_at)}</span> ·{' '}
          <span className={styles.nowrap}>
            {formatWeekday(event.starts_at)} · {formatTime(event.starts_at)}
          </span>
        </time>
      </p>
      {event.status !== 'iptal' && (
        <p className={styles.relative}>{relativeDay(event.starts_at)}</p>
      )}
      <hr className={styles.rule} />
      <LocationLine event={event} location={location} />

      {variant === 'room' && (
        <>
          <div className={styles.actions}>
            {film && (
              <Link className={`${ui.button} ${ui.primary}`} href={`/filmler/${film.slug}/okuma`}>
                ön okumaya geç <span aria-hidden="true">→</span>
              </Link>
            )}
            {event.number && event.status !== 'iptal' && (
              <Link className={ui.button} href={`/geceler/${event.number}#katilim`}>
                {invite?.rsvp ? 'katılımını değiştir' : 'katılımını bildir'}
              </Link>
            )}
          </div>
          {invite?.rsvp && <p className={styles.rsvpState}>katılımın: {RSVP_TEXT[invite.rsvp]}</p>}
        </>
      )}
    </section>
  );
}
