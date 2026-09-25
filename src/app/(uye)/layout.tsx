import { SiteFooter } from '@/components/member/SiteFooter';
import { SiteHeader } from '@/components/member/SiteHeader';
import styles from '@/components/member/Shell.module.css';
import { requireMember } from '@/server/auth/viewer';

// Every page below also calls requireMember()/requireStaff() itself and all
// data goes through RLS — this layout check is for the frame only.
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireMember();
  return (
    <>
      <a className="skip-link" href="#icerik">
        içeriğe geç
      </a>
      <SiteHeader name={viewer.displayName} staff={viewer.isStaff} />
      <main id="icerik" className={styles.main}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
