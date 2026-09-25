import type { Metadata } from 'next';
import Link from 'next/link';
import { DoorStage } from '@/components/door/DoorStage';
import { RecoveryForm } from '@/components/door/RecoveryForm';
import styles from '@/components/door/Door.module.css';
import { mailConfigured } from '@/server/system/mail';

export const metadata: Metadata = { title: 'giriş kodu' };

export default function LostKeyPage() {
  // without a mail provider nothing can be sent: say so, the same way to everyone
  if (!mailConfigured()) {
    return (
      <DoorStage compact>
        <p className={styles.copy}>
          bu kurulumda e-posta gönderimi açık değil. yeni bir giriş kodu için kulübün yöneticisine
          yaz; kod sana özel bir kanaldan iletilir.
        </p>
        <p className={styles.aside}>
          <Link href="/">kapıya dön</Link>
        </p>
      </DoorStage>
    );
  }
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
