import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DoorStage } from '@/components/door/DoorStage';
import { SetupForm } from '@/components/door/SetupForm';
import styles from '@/components/door/Door.module.css';
import { setupAvailable } from '@/server/auth/setup';

export const metadata: Metadata = { title: 'kurulum' };

// Exists only between deployment and the first owner; afterwards it is the door.
export default async function SetupPage() {
  if (!(await setupAvailable())) redirect('/');
  return (
    <DoorStage compact>
      <p className={styles.copy}>
        ilk kurucu hesabı. barındırmada tanımladığın kurulum anahtarını ve adını yaz. tek
        kullanımlık giriş kodu yalnızca bir kez gösterilir.
      </p>
      <SetupForm />
    </DoorStage>
  );
}
