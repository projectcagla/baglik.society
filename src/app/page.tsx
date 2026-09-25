import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DoorForm } from '@/components/door/Door';
import { DoorStage } from '@/components/door/DoorStage';
import styles from '@/components/door/Door.module.css';
import { RETURN_COOKIE } from '@/lib/session-cookie';
import { safeReturnPath } from '@/lib/return-path';
import { getViewer } from '@/server/auth/viewer';

export default async function DoorPage() {
  if (await getViewer()) {
    redirect(safeReturnPath((await cookies()).get(RETURN_COOKIE)?.value) ?? '/oda');
  }
  return (
    <DoorStage>
      <DoorForm />
      <p className={styles.aside}>
        <Link href="/kayip-anahtar">kodunu mu kaybettin?</Link>
      </p>
    </DoorStage>
  );
}
