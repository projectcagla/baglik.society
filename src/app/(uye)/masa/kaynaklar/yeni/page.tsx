import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResourceForm } from '@/components/desk/ResourceForm';
import styles from '@/components/desk/Desk.module.css';
import { programLabel } from '@/lib/text';
import { requireStaff } from '@/server/auth/viewer';
import { deskFilm } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · yeni kaynak' };

export default async function NewResource(props: PageProps<'/masa/kaynaklar/yeni'>) {
  const viewer = await requireStaff();
  const sp = await props.searchParams;
  const filmId = typeof sp.film === 'string' ? sp.film : '';
  const layer = sp.layer === 'sonra' ? 'sonra' : 'once';
  if (!/^[0-9a-f-]{36}$/.test(filmId)) notFound();
  const data = await deskFilm(viewer, filmId);
  if (!data) notFound();
  return (
    <>
      <p className="meta">
        <Link href={`/masa/filmler/${filmId}`}>
          {programLabel(data.film.program_no, data.film.title)}
        </Link>{' '}
        · yeni kaynak
      </p>
      <h1 className={styles.title}>yeni kaynak</h1>
      <ResourceForm filmId={filmId} layer={layer} />
    </>
  );
}
