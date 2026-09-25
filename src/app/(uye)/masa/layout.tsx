import { DeskNav } from '@/components/desk/DeskNav';
import styles from '@/components/desk/Desk.module.css';
import { requireStaff } from '@/server/auth/viewer';

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return (
    <div className={styles.desk}>
      <DeskNav admin={viewer.isAdmin} />
      {children}
    </div>
  );
}
