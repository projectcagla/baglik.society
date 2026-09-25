import type { EventRow, LocationView } from '@/server/dal/events';
import { safeHref } from '@/lib/richtext';
import { ExternalLink } from '@/components/ui/ExternalLink';
import styles from './Room.module.css';

/** Renders exactly what app.event_location() allowed — nothing more is in the payload. */
export function LocationLine({ event, location }: { event: EventRow; location: LocationView }) {
  switch (location.state) {
    case 'acik': {
      const href = location.location_url ? safeHref(location.location_url) : null;
      return (
        <div className={styles.whereOpen}>
          <span className="meta">konum</span>
          <strong>{location.location_text}</strong>
          {location.location_directions && (
            <p className={styles.where}>{location.location_directions}</p>
          )}
          {href && <ExternalLink href={href}>haritada aç</ExternalLink>}
        </div>
      );
    }
    case 'paylasilmadi':
      return <p className={styles.where}>konum bilgisi henüz paylaşılmadı.</p>;
    case 'katilim_gerekli':
      return <p className={styles.where}>konum, katılımını bildiren davetlilerle paylaşıldı.</p>;
    case 'iptal':
      return <p className={styles.where}>bu gece iptal edildi.</p>;
    default:
      return <p className={styles.where}>{event.location_public_note}</p>;
  }
}
