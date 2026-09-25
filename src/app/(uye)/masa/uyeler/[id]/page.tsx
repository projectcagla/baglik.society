import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditMemberForm, MemberOp } from '@/components/desk/MemberForms';
import styles from '@/components/desk/Desk.module.css';
import { formatShort } from '@/lib/dates';
import { credentialSummary } from '@/server/auth/door';
import { listSessions } from '@/server/auth/session';
import { requireAdmin } from '@/server/auth/viewer';
import { deskMember } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · üye' };

const KIND: Record<string, string> = { key: 'kişisel anahtar', invite: 'davet kodu', recovery: 'kurtarma kodu' };

export default async function DeskMemberPage(props: PageProps<'/masa/uyeler/[id]'>) {
  const viewer = await requireAdmin();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await deskMember(viewer, id);
  if (!member) notFound();
  const [creds, sessions] = await Promise.all([credentialSummary(id), listSessions(id)]);
  const isOwner = viewer.role === 'owner';
  const self = member.id === viewer.id;

  return (
    <>
      <p className="meta">
        <Link href="/masa/uyeler">üyeler</Link>
      </p>
      <h1 className={styles.title}>{member.display_name}</h1>

      <section className={styles.panel}>
        <h2>bilgiler</h2>
        <EditMemberForm member={member} isOwner={isOwner} />
      </section>

      <section className={styles.panel}>
        <h2>erişim</h2>
        <ul className={styles.items}>
          {creds.map((c, i) => (
            <li key={i} className={styles.item}>
              <span>
                {KIND[c.kind]} · oluşturuldu {formatShort(c.created_at)}
                {c.used_at && ` · kullanıldı ${formatShort(c.used_at)}`}
                {c.revoked_at && ' · geçersiz'}
                {!c.revoked_at && !c.used_at && c.expires_at && ` · son ${formatShort(c.expires_at)}`}
              </span>
            </li>
          ))}
          {creds.length === 0 && <li className={styles.item}>kod yok.</li>}
        </ul>
        <p className="meta">{sessions.length} açık oturum</p>
        {member.status !== 'revoked' && <MemberOp id={id} op="invite" label="yeni davet kodu üret" />}
        {!self && <MemberOp id={id} op="sessions" label="tüm oturumlarını kapat" />}
        {isOwner && !self && <MemberOp id={id} op="mfa-reset" label="ikinci doğrulamayı sıfırla" />}
      </section>

      {!self && (
        <section className={`${styles.panel} ${styles.panelWarn}`}>
          <h2>üyelik</h2>
          {member.status === 'revoked' ? (
            <MemberOp id={id} op="restore" label="üyeliği geri aç" />
          ) : (
            <MemberOp id={id} op="revoke" label="üyeliği iptal et (kodlar ve oturumlar düşer)" danger />
          )}
          <p className="meta">
            kalıcı silme: kişinin notları, katılım kayıtları ve oturumları da silinir (KVKK silme talebi).
          </p>
          <MemberOp id={id} op="delete" label="kalıcı olarak sil" danger confirm />
        </section>
      )}
    </>
  );
}
