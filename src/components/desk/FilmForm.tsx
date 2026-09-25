'use client';

import { useActionState } from 'react';
import { createFilmAction, updateFilmAction, type DeskState } from '@/server/actions/desk';
import type { FilmRow } from '@/server/dal/films';
import ui from '@/components/ui/ui.module.css';
import { Area, Select, Text } from './Field';
import { FormStatus } from './FormStatus';
import styles from './Desk.module.css';

const initial: DeskState = { ok: false, message: null };

export const FILM_STATUSES = [
  ['oneri', 'öneri'],
  ['secildi', 'seçildi'],
  ['yaklasiyor', 'yaklaşıyor'],
  ['izlendi', 'izlendi'],
  ['arsiv', 'arşiv'],
] as const;

export function FilmForm({ film }: { film?: FilmRow }) {
  const [state, action, pending] = useActionState(
    film ? updateFilmAction : createFilmAction,
    initial,
  );
  const screened = film?.screened_on ? new Date(film.screened_on).toISOString().slice(0, 10) : '';
  return (
    <form action={action} className={styles.grid}>
      {film && <input type="hidden" name="id" value={film.id} />}
      <div className={styles.cols3}>
        <Text
          name="program_no"
          label="program no"
          defaultValue={film?.program_no}
          inputMode="numeric"
          hint="001, 002… sıralama ve adres için"
        />
        <Text
          name="title"
          label="görünen ad"
          required
          defaultValue={film?.title}
          hint="kulübün kullandığı ad (ör. canavar)"
        />
        <Text name="title_original" label="özgün ad" defaultValue={film?.title_original} />
      </div>
      <div className={styles.cols3}>
        <Text name="director" label="yönetmen" defaultValue={film?.director} />
        <Text name="year" label="yıl" defaultValue={film?.year} inputMode="numeric" />
        <Select
          name="status"
          label="durum"
          options={FILM_STATUSES}
          defaultValue={film?.status ?? 'oneri'}
        />
      </div>
      <div className={styles.cols3}>
        <Text
          name="runtime_min"
          label="süre (dk)"
          defaultValue={film?.runtime_min}
          inputMode="numeric"
        />
        <Text
          name="runtime_source"
          label="süre kaynağı"
          defaultValue={film?.runtime_source}
          hint="doğrulandığı yer"
        />
        <Text
          name="screened_on"
          type="date"
          label="gösterim tarihi"
          defaultValue={screened}
          hint="bilinmiyorsa boş bırak"
        />
      </div>
      <div className={styles.cols3}>
        <Text name="country" label="ülke" defaultValue={film?.country} />
        <Text name="language" label="dil" defaultValue={film?.language} />
        <Text
          name="sort_key"
          label="arşiv sırası"
          defaultValue={film?.sort_key}
          inputMode="numeric"
          hint="boşsa program no"
        />
      </div>
      <Area name="intro" label="spoiler içermeyen kısa giriş" defaultValue={film?.intro} rows={4} />
      <div className={styles.cols3}>
        <Text
          name="themes"
          label="izlekler"
          defaultValue={film?.themes.join(', ')}
          hint="virgülle: hafıza, aile"
        />
        <Text name="curator_credit" label="seçki ve notlar" defaultValue={film?.curator_credit} />
        <Text
          name="reading_label"
          label="okuma başlığı"
          defaultValue={film?.reading_label}
          hint="ör. gösterim öncesi"
        />
      </div>
      <div className={styles.cols3}>
        <Text
          name="slug"
          label="adres (slug)"
          defaultValue={film?.slug}
          hint="boşsa numara + addan üretilir"
        />
        <Text name="image_credit" label="görsel kaynağı" defaultValue={film?.image_credit} />
        <Text
          name="image_rights"
          label="görsel kullanım hakkı"
          defaultValue={film?.image_rights}
          hint="belirsizse görsel kullanılmaz"
        />
      </div>
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : film ? 'kaydet' : 'film oluştur (taslak)'}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
