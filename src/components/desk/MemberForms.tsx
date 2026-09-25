'use client';

import { useActionState } from 'react';
import {
  createMemberAction,
  importMembersAction,
  memberOpAction,
  updateMemberAction,
  type DeskState,
} from '@/server/actions/desk';
import ui from '@/components/ui/ui.module.css';
import { Area, Select, Text } from './Field';
import { FormStatus } from './FormStatus';
import styles from './Desk.module.css';

const initial: DeskState = { ok: false, message: null };

export function roleOptions(isOwner: boolean) {
  const base = [
    ['member', 'üye'],
    ['editor', 'editör'],
  ] as const;
  return isOwner ? ([...base, ['admin', 'yönetici'], ['owner', 'kurucu']] as const) : base;
}

export function CreateMemberForm({ isOwner, nextEvent }: { isOwner: boolean; nextEvent: { id: string; label: string } | null }) {
  const [state, action, pending] = useActionState(createMemberAction, initial);
  return (
    <form action={action} className={styles.grid}>
      <div className={styles.cols3}>
        <Text name="display_name" label="ad" required />
        <Text name="email" type="email" label="e-posta (isteğe bağlı)" hint="kod kurtarma ve bildirimler için" />
        <Select name="role" label="rol" options={roleOptions(isOwner)} defaultValue="member" />
      </div>
      {nextEvent && (
        <label className={ui.check}>
          <input type="checkbox" name="inviteTo" value={nextEvent.id} defaultChecked /> {nextEvent.label} için davet et
        </label>
      )}
      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : 'üyeyi ekle ve davet kodu üret'}
        </button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function ImportMembersForm({ nextEvent }: { nextEvent: { id: string; label: string } | null }) {
  const [state, action, pending] = useActionState(importMembersAction, initial);
  return (
    <form action={action} className={styles.grid}>
      <Area name="lines" label="her satıra bir kişi: ad, e-posta" rows={5} hint="e-posta isteğe bağlı. en fazla 50 satır." />
      {nextEvent && (
        <label className={ui.check}>
          <input type="checkbox" name="inviteTo" value={nextEvent.id} /> hepsini {nextEvent.label} için davet et
        </label>
      )}
      <div className={ui.row}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? 'bekle' : 'toplu ekle'}
        </button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function EditMemberForm({
  member,
  isOwner,
}: {
  member: { id: string; display_name: string; email: string | null; role: string };
  isOwner: boolean;
}) {
  const [state, action, pending] = useActionState(updateMemberAction, initial);
  const locked = !isOwner && (member.role === 'owner' || member.role === 'admin');
  return (
    <form action={action} className={styles.grid}>
      <input type="hidden" name="id" value={member.id} />
      <div className={styles.cols3}>
        <Text name="display_name" label="ad" defaultValue={member.display_name} required />
        <Text name="email" type="email" label="e-posta" defaultValue={member.email} />
        {locked ? (
          <>
            <input type="hidden" name="role" value={member.role} />
            <p className={ui.hint}>rolü yalnızca kurucu değiştirebilir.</p>
          </>
        ) : (
          <Select name="role" label="rol" options={roleOptions(isOwner)} defaultValue={member.role} />
        )}
      </div>
      <div className={ui.row}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? 'bekle' : 'kaydet'}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function MemberOp({ id, op, label, danger, confirm }: { id: string; op: string; label: string; danger?: boolean; confirm?: boolean }) {
  const [state, action, pending] = useActionState(memberOpAction, initial);
  return (
    <form action={action} className={styles.grid}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <div className={ui.row}>
        {confirm && (
          <input name="confirm" className={ui.input} placeholder="onay için: sil" aria-label="onay için sil yaz" style={{ maxWidth: '10rem' }} />
        )}
        <button type="submit" className={`${ui.button} ${ui.small} ${danger ? ui.danger : ''}`} disabled={pending}>
          {pending ? 'bekle' : label}
        </button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}
