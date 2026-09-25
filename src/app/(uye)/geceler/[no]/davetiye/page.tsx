import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from '@/components/member/Invitation.module.css';
import ed from '@/components/member/Editorial.module.css';
import ui from '@/components/ui/ui.module.css';
import { requireMember } from '@/server/auth/viewer';
import { getEventByNumber } from '@/server/dal/events';
import { FORMATS } from '@/server/invitation/poster';

export const metadata: Metadata = { title: 'davetiye' };

export default async function InvitationPage(props: PageProps<'/geceler/[no]/davetiye'>) {
  const viewer = await requireMember();
  const no = Number((await props.params).no);
  const view = Number.isInteger(no) ? await getEventByNumber(viewer, no) : null;
  if (!view || (view.invite?.status !== 'davetli' && !viewer.isStaff)) notFound();
  const base = `/geceler/${no}/davetiye`;

  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <p className={ed.kicker}>
          <Link href={`/geceler/${no}`}>{no}. film gecesi</Link> · davetiye
        </p>
        <h1 className={ed.h1}>davetiye</h1>
        <p className={ed.lede}>
          görseller gecenin kaydından üretilir. konum hiçbir görselde yer almaz; yalnızca davetliler ve masa indirebilir.
        </p>
      </header>
      <div className={styles.grid}>
        {(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map((f) => (
          <figure key={f} className={styles.item} data-format={f}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered on demand, private */}
            <img
              src={`${base}/${f}`}
              alt={`${no}. film gecesi davetiyesi, ${FORMATS[f].label}`}
              width={FORMATS[f].width}
              height={FORMATS[f].height}
              loading="lazy"
            />
            <figcaption>
              <span className="meta">{FORMATS[f].label}</span>
              <span className={ui.row}>
                <a className={`${ui.button} ${ui.small}`} href={`${base}/${f}?indir=1`} download>
                  png
                </a>
                <a className={`${ui.button} ${ui.small}`} href={`${base}/${f}?indir=1&bicim=jpg`} download>
                  jpg
                </a>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
