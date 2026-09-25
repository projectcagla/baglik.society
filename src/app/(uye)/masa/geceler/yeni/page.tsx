import type { Metadata } from 'next';
import { EventForm } from '@/components/desk/EventForms';
import styles from '@/components/desk/Desk.module.css';
import { programLabel } from '@/lib/text';
import { requireAdmin } from '@/server/auth/viewer';
import { deskFilms } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · yeni gece' };

export default async function NewEvent() {
  const viewer = await requireAdmin();
  const films = (await deskFilms(viewer)).map((f) => ({ id: f.id, label: programLabel(f.program_no, f.title) }));
  return (
    <>
      <h1 className={styles.title}>yeni gece</h1>
      <EventForm
        films={films}
        values={{
          number: null,
          title: null,
          starts_at: '',
          ends_at: '',
          status: 'taslak',
          status_note: null,
          rsvp_deadline: '',
          capacity: null,
          location_public_note: 'konum etkinlik günü davetlilere iletilecektir',
          guest_list_visible: false,
          film_ids: [],
        }}
      />
    </>
  );
}
