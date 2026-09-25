import type { Metadata } from 'next';
import Link from 'next/link';
import { DoorStage } from '@/components/door/DoorStage';
import { RecoveryForm } from '@/components/door/RecoveryForm';
import styles from '@/components/door/Door.module.css';

export const metadata: Metadata = { title: 'giriş kodu' };

export default function LostKeyPage() {
  return (
    <DoorStage compact>
      <p className={styles.copy}>
        kayıtlı e-posta adresini yaz. adres bir üyeye aitse tek kullanımlık, yarım saat geçerli bir
        giriş kodu gönderilir.
      </p>
      <RecoveryForm />
      <p className={styles.aside}>
        <Link href="/">kapıya dön</Link>
      </p>
    </DoorStage>
  );
}
