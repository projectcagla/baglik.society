import type { Metadata } from 'next';
import Link from 'next/link';
import { EventHero } from '@/components/member/EventHero';
import styles from '@/components/member/Room.module.css';
import { programLabel } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { hasPersonalKey } from '@/server/auth/door';
import { nextEvent } from '@/server/dal/events';
import { latestPublishedResource, listFilms } from '@/server/dal/films';

export const metadata: Metadata = { title: 'oda' };

export default async function RoomPage() {
  const viewer = await requireMember();
  const [next, films, latest, keyExists] = await Promise.all([
    nextEvent(viewer),
    listFilms(viewer),
    latestPublishedResource(viewer),
    hasPersonalKey(viewer.id),
  ]);
  const nextFilmId = next?.films[0]?.id;
  const archive = films.filter(
    (f) => f.published_at && f.id !== nextFilmId && (f.status === 'izlendi' || f.status === 'arsiv'),
  );

  return (
    <div className={styles.room}>
      {next ? (
        <EventHero view={next} variant="room" />
      ) : (
        <section className={styles.none} aria-labelledby="oda-bos">
          <p className={styles.kicker}>sıradaki gece</p>
          <h1 id="oda-bos" className={styles.director}>
            şu an planlanmış bir gece yok.
          </h1>
        </section>
      )}

      <aside className={styles.aside} aria-label="odada ayrıca">
        {!keyExists && (
          <p className={styles.rsvpState}>
            henüz kişisel anahtarın yok. başka bir cihazdan girebilmek için{' '}
            <Link href="/hosgeldin">anahtarını oluştur</Link>.
          </p>
        )}
        {latest && (
          <div className={styles.latest}>
            <span className="meta">son eklenen</span>
            <Link href={`/filmler/${latest.film_slug}/okuma#k-${latest.id.slice(0, 8)}`}>
              {latest.heading ?? latest.title_original}
            </Link>
            <span className="meta">
              {[latest.publication, latest.author].filter(Boolean).join(' · ')} — {programLabel(latest.program_no, latest.film_title)}
            </span>
          </div>
        )}
        {archive.length > 0 && (
          <p className={styles.archive}>
            <span className="meta">arşiv</span>
            {archive.map((f) => (
              <Link key={f.id} href={`/filmler/${f.slug}`}>
                {programLabel(f.program_no, f.title)}
              </Link>
            ))}
          </p>
        )}
      </aside>
    </div>
  );
}
