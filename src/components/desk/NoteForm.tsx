'use client';

import { useActionState } from 'react';
import { saveNoteAction, type DeskState } from '@/server/actions/desk';
import ui from '@/components/ui/ui.module.css';
import { Area, Text } from './Field';
import { FormStatus } from './FormStatus';
import { DraftKeeper } from './DraftKeeper';
import styles from './Desk.module.css';

const initial: DeskState = { ok: false, message: null };

export function NoteForm({
  filmId,
  note,
}: {
  filmId: string;
  note?: { id: string; title: string; body: string; author_credit: string | null };
}) {
  const [state, action, pending] = useActionState(saveNoteAction, initial);
  const formId = `note-${note?.id ?? `new-${filmId}`}`;
  return (
    <form id={formId} action={action} className={styles.grid}>
      <input type="hidden" name="filmId" value={filmId} />
      <input type="hidden" name="id" value={note?.id ?? ''} />
      <Text name="title" label="başlık" defaultValue={note?.title ?? 'editörün notu'} required />
      <Area
        name="body"
        label="metin (isteğe bağlı, 80–180 kelime)"
        defaultValue={note?.body}
        rows={10}
        hint="gecenin ardından kendi yazdığın kısa not; özet uydurma, otomatik üretilmiş metin koyma. boş satır: yeni paragraf · *italik* · [metin](https://…)"
      />
      <Text name="author_credit" label="imza (isteğe bağlı)" defaultValue={note?.author_credit} />
      <div className={ui.row}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? 'bekle' : 'kaydet'}
        </button>
        <FormStatus state={state} />
      </div>
      <DraftKeeper formId={formId} saved={state.ok} />
    </form>
  );
}
