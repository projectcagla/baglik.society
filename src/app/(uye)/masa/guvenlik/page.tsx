import type { Metadata } from 'next';
import { MfaSetup } from '@/components/desk/MfaSetup';
import styles from '@/components/desk/Desk.module.css';
import { MFA_FRESH_HOURS } from '@/server/auth/session';
import { mfaStatus } from '@/server/auth/mfa';
import { requireStaff } from '@/server/auth/viewer';

export const metadata: Metadata = { title: 'masa · güvenlik' };

export default async function SecurityPage(props: PageProps<'/masa/guvenlik'>) {
  const viewer = await requireStaff();
  const r = (await props.searchParams).r;
  const returnTo =
    typeof r === 'string' && r.startsWith('/masa') && !r.startsWith('//') ? r : '/masa';

  if (!viewer.isAdmin) {
    return (
      <>
        <h1 className={styles.title}>güvenlik</h1>
        <p>
          editör hesabı üyelik kodlarına, davetlilere ve konuma erişmez; ikinci doğrulama gerekmez.
        </p>
      </>
    );
  }
  const status = await mfaStatus(viewer.id);
  return (
    <>
      <h1 className={styles.title}>ikinci doğrulama</h1>
      <section className={styles.panel}>
        {viewer.mfaFresh ? (
          <p>bu oturumda doğrulandın. {MFA_FRESH_HOURS} saat boyunca yönetici işlemleri açık.</p>
        ) : (
          <p>
            üyeler, davetler ve konum gibi işlemler için{' '}
            {status.enrolled ? 'kodu gir' : 'önce kurulum yap'}. doğrulama bu oturumda{' '}
            {MFA_FRESH_HOURS} saat geçerlidir.
          </p>
        )}
        {!viewer.mfaFresh && <MfaSetup enrolled={status.enrolled} returnTo={returnTo} />}
      </section>
      <p className="meta">
        doğrulama uygulamanı kaybedersen: kurucu, başka bir yöneticinin ikinci doğrulamasını masadan
        sıfırlayabilir; kurucunun kendisi için veritabanı erişimiyle `npm run mfa:reset -- --email
        …` gerekir.
      </p>
    </>
  );
}
