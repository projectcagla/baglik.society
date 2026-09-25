import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/member/Event.module.css';
import ed from '@/components/member/Editorial.module.css';
import { formatEventDate, nowMs } from '@/lib/dates';
import { brandLower, programNo } from '@/lib/text';
import { requireMember } from '@/server/auth/viewer';
import { listEvents, type EventListItem } from '@/server/dal/events';

export const metadata: Metadata = { title: 'geceler' };

const RSVP: Record<string, string> = {
  geliyorum: 'geliyorum',
  gelemiyorum: 'gelemiyorum',
  belirsiz: 'belli değil',
};
const STATUS: Record<string, string> = { ertelendi: 'ertelendi', iptal: 'iptal', tamamlandi: '' };

function Row({ e }: { e: EventListItem }) {
  const night = e.title ? brandLower(e.title) : `${e.number}. film gecesi`;
  const inner = (
    <>
      <span className={styles.title}>
        {e.film_title ? `${programNo(e.program_no)} / ${brandLower(e.film_title)}` : night}
      </span>
      <span className={styles.state}>{STATUS[e.status] || (e.rsvp ? RSVP[e.rsvp] : '')}</span>
      <span className={styles.when}>
        {night} · {formatEventDate(e.starts_at)}
      </span>
    </>
  );
  return (
    <li>
      {e.number ? (
        <Link href={`/geceler/${e.number}`} className={styles.row}>
          {inner}
        </Link>
      ) : (
        <div className={styles.row}>{inner}</div>
      )}
    </li>
  );
}

export default async function NightsPage() {
  const viewer = await requireMember();
  const events = await listEvents(viewer);
  const now = nowMs() - 6 * 3600 * 1000;
  const upcoming = events
    .filter((e) => e.starts_at.getTime() >= now && e.status !== 'tamamlandi')
    .reverse();
  const past = events.filter((e) => e.starts_at.getTime() < now || e.status === 'tamamlandi');

  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <h1 className={ed.h1}>geceler</h1>
        <p className={ed.lede}>davetli olduğun film geceleri.</p>
      </header>
      <section className={ed.section} aria-labelledby="yaklasan">
        <h2 id="yaklasan" className={ed.kicker}>
          yaklaşan
        </h2>
        {upcoming.length ? (
          <ul role="list" className={ed.list}>
            {upcoming.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className={ed.empty}>yaklaşan bir davet yok.</p>
        )}
      </section>
      <section className={ed.section} aria-labelledby="gecmis">
        <h2 id="gecmis" className={ed.kicker}>
          geçmiş
        </h2>
        {past.length ? (
          <ul role="list" className={ed.list}>
            {past.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className={ed.empty}>kayıtlı geçmiş gece yok.</p>
        )}
      </section>
    </div>
  );
}
