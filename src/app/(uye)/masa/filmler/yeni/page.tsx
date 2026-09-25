import type { Metadata } from 'next';
import { FilmForm } from '@/components/desk/FilmForm';
import styles from '@/components/desk/Desk.module.css';
import { requireStaff } from '@/server/auth/viewer';

export const metadata: Metadata = { title: 'masa · yeni film' };

export default async function NewFilm() {
  await requireStaff();
  return (
    <>
      <h1 className={styles.title}>yeni film</h1>
      <p className="meta">taslak olarak oluşur; yayımlayana kadar üyeler görmez.</p>
      <FilmForm />
    </>
  );
}
