'use client';

import { useActionState } from 'react';
import { notifyAction, saveEventAction, saveLocationAction, type DeskState } from '@/server/actions/desk';
import ui from '@/components/ui/ui.module.css';
import { Area, Check, Select, Text } from './Field';
import { FormStatus } from './FormStatus';
import styles from './Desk.module.css';

const initial: DeskState = { ok: false, message: null };

export interface EventFormValues {
  id?: string;
  number: number | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  status_note: string | null;
  rsvp_deadline: string;
  capacity: number | null;
  location_public_note: string;
  guest_list_visible: boolean;
  film_ids: string[];
}

const STATUSES = [
  ['taslak', 'taslak (davetliler görmez)'],
  ['davet', 'davet gönderildi'],
  ['ertelendi', 'ertelendi'],
  ['iptal', 'iptal'],
  ['tamamlandi', 'tamamlandı'],
] as const;

export function EventForm({ values, films }: { values: EventFormValues; films: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(saveEventAction, initial);
  return (
    <form action={action} className={styles.grid}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className={styles.cols3}>
        <Text name="number" label="gece no" defaultValue={values.number} inputMode="numeric" />
        <Text name="title" label="özel başlık" defaultValue={values.title} hint="boşsa “N. film gecesi”" />
        <Select name="status" label="durum" options={STATUSES} defaultValue={values.status} />
      </div>
      <div className={styles.cols3}>
        <Text name="starts_at" type="datetime-local" label="başlangıç (istanbul)" defaultValue={values.starts_at} required />
        <Text name="ends_at" type="datetime-local" label="bitiş (isteğe bağlı)" defaultValue={values.ends_at} />
        <Text name="rsvp_deadline" type="datetime-local" label="katılım son tarihi" defaultValue={values.rsvp_deadline} />
      </div>
      <fieldset className={ui.fieldset}>
        <legend>film(ler)</legend>
        <div className={ui.segmented}>
          {films.map((f) => (
            <label key={f.id}>
              <input type="checkbox" name="film_ids" value={f.id} defaultChecked={values.film_ids.includes(f.id)} /> {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.cols2}>
        <Text name="location_public_note" label="genel konum metni" defaultValue={values.location_public_note} required hint="konum açılana kadar davetlilerin gördüğü cümle" />
        <Text name="status_note" label="durum notu" defaultValue={values.status_note} hint="erteleme/iptal açıklaması" />
      </div>
      <div className={styles.cols2}>
        <Text name="capacity" label="kapasite" defaultValue={values.capacity} inputMode="numeric" />
        <Check name="guest_list_visible" label="“geliyorum” diyenlerin adlarını davetlilere göster" defaultChecked={values.guest_list_visible} />
      </div>
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : values.id ? 'kaydet' : 'geceyi oluştur'}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export interface LocationValues {
  eventId: string;
  location_text: string | null;
  location_url: string | null;
  location_directions: string | null;
  release_at: string;
  release_audience: string;
  include_in_email: boolean;
  admin_note: string | null;
}

export function LocationForm({ values }: { values: LocationValues }) {
  const [state, action, pending] = useActionState(saveLocationAction, initial);
  return (
    <form action={action} className={styles.grid}>
      <input type="hidden" name="eventId" value={values.eventId} />
      <Text name="location_text" label="gerçek konum" defaultValue={values.location_text} hint="bilinmiyorsa boş bırak — sahte adres girme" />
      <div className={styles.cols2}>
        <Text name="location_url" type="url" label="harita bağlantısı" defaultValue={values.location_url} />
        <Text name="location_directions" label="tarif" defaultValue={values.location_directions} />
      </div>
      <div className={styles.cols3}>
        <Text name="release_at" type="datetime-local" label="açılış zamanı (istanbul)" defaultValue={values.release_at} hint="bu andan sonra uygun davetliler görür" />
        <Select
          name="release_audience"
          label="kimler görür"
          options={[['katilanlar', '“geliyorum” diyenler'], ['davetliler', 'tüm davetliler']] as const}
          defaultValue={values.release_audience}
        />
        <Check name="include_in_email" label="bildirim e-postasına adresi ekle" defaultChecked={values.include_in_email} />
      </div>
      <Area name="admin_note" label="yönetici notu (yalnızca yöneticiler)" defaultValue={values.admin_note} rows={3} />
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : 'konum ayarlarını kaydet'}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function NotifyForm({ eventId, kind, label }: { eventId: string; kind: 'konum' | 'hatirlatma'; label: string }) {
  const [state, action, pending] = useActionState(notifyAction, initial);
  return (
    <form action={action} className={styles.grid}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value={kind} />
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.small}`} disabled={pending}>
          {pending ? 'bekle' : label}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
