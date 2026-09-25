import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyCreator } from '@/components/member/KeyCreator';
import ed from '@/components/member/Editorial.module.css';
import { hasPersonalKey } from '@/server/auth/door';
import { requireMember } from '@/server/auth/viewer';

export const metadata: Metadata = { title: 'hoş geldin' };

export default async function WelcomePage() {
  const viewer = await requireMember();
  const hasKey = await hasPersonalKey(viewer.id);
  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <p className={ed.kicker}>kişisel anahtar</p>
        <h1 className={ed.h1}>hoş geldin, {viewer.displayName.split(' ')[0]}.</h1>
        <p className={ed.lede}>
          bu tarayıcıda oturumun açık. davet kodun tek kullanımlıktı; başka bir cihazdan ya da oturumun kapandığında
          kapıdan girmek için kişisel bir anahtara ihtiyacın var. anahtar yalnızca sana aittir; kimseyle paylaşma.
        </p>
      </header>
      <section className={`${ed.section} ${ed.narrow}`}>
        <KeyCreator hasKey={hasKey} account={viewer.email ?? viewer.displayName} />
        {hasKey && (
          <p className={ed.secondary}>
            zaten bir anahtarın var. <Link href="/oda">odaya geç</Link>
          </p>
        )}
      </section>
    </div>
  );
}
