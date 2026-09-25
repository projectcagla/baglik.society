import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateMemberForm, ImportMembersForm } from '@/components/desk/MemberForms';
import styles from '@/components/desk/Desk.module.css';
import { formatShort, nowMs } from '@/lib/dates';
import { requireAdmin } from '@/server/auth/viewer';
import { deskEvents, deskMembers } from '@/server/dal/desk';

export const metadata: Metadata = { title: 'masa · üyeler' };

const ROLE: Record<string, string> = {
  owner: 'kurucu',
  admin: 'yönetici',
  editor: 'editör',
  member: 'üye',
};
const STATUS: Record<string, string> = {
  invited: 'davet edildi',
  active: 'aktif',
  revoked: 'iptal',
};

export default async function DeskMembers() {
  const viewer = await requireAdmin();
  const [members, events] = await Promise.all([deskMembers(viewer), deskEvents(viewer)]);
  const next = events.filter((e) => e.starts_at.getTime() > nowMs() && e.status !== 'iptal').at(-1);
  const nextEvent = next ? { id: next.id, label: `${next.number}. film gecesi` } : null;

  return (
    <>
      <h1 className={styles.title}>üyeler</h1>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ad</th>
              <th>rol</th>
              <th>durum</th>
              <th>e-posta</th>
              <th>eklendi</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/masa/uyeler/${m.id}`}>{m.display_name}</Link>
                </td>
                <td>{ROLE[m.role]}</td>
                <td>
                  <span
                    className={`${styles.pill} ${m.status === 'active' ? styles.pillOk : m.status === 'revoked' ? styles.pillBad : styles.pillWarn}`}
                  >
                    {STATUS[m.status]}
                  </span>
                </td>
                <td>{m.email ?? '—'}</td>
                <td className="meta">{formatShort(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={styles.panel} aria-labelledby="yeni-uye">
        <h2 id="yeni-uye">yeni üye</h2>
        <p className="meta">
          tek kullanımlık davet kodu 14 gün geçerlidir ve yalnızca bir kez gösterilir. kodu kişiye
          özel bir kanaldan ilet.
        </p>
        <CreateMemberForm isOwner={viewer.role === 'owner'} nextEvent={nextEvent} />
      </section>

      <section className={styles.panel} aria-labelledby="toplu">
        <h2 id="toplu">toplu ekle</h2>
        <ImportMembersForm nextEvent={nextEvent} />
      </section>
    </>
  );
}
