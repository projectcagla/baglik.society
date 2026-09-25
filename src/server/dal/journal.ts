import 'server-only';
import { asMember } from '@/server/db/context';
import { actorOf, type Viewer } from '@/server/auth/viewer';

export interface JournalEntry {
  id: string;
  member_id: string;
  film_id: string | null;
  film_title: string | null;
  film_slug: string | null;
  program_no: number | null;
  kind: 'beklenti' | 'hatira' | 'serbest';
  body: string;
  visibility: 'ozel' | 'paylasildi';
  attribution: 'isimli' | 'anonim';
  attribution_name: string | null;
  shared_at: Date | null;
  moderation: 'gorunur' | 'gizlendi';
  created_at: Date;
  updated_at: Date;
}

export async function listOwnEntries(v: Viewer): Promise<JournalEntry[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<JournalEntry[]>`
      select j.*, f.title as film_title, f.slug as film_slug, f.program_no
        from journal_entries j left join films f on f.id = j.film_id
       where j.member_id = ${v.id}
       order by j.created_at desc`,
  );
}

/** Notes members chose to share. Private entries of others never match (RLS). */
export async function listSharedEntries(v: Viewer): Promise<JournalEntry[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<JournalEntry[]>`
      select j.*, f.title as film_title, f.slug as film_slug, f.program_no
        from journal_entries j left join films f on f.id = j.film_id
       where j.visibility = 'paylasildi' and j.moderation = 'gorunur'
       order by j.shared_at desc nulls last
       limit 60`,
  );
}

export interface EntryInput {
  filmId: string | null;
  kind: JournalEntry['kind'];
  body: string;
}

export async function createEntry(v: Viewer, input: EntryInput): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`insert into journal_entries (member_id, film_id, kind, body)
             values (${v.id}, ${input.filmId}, ${input.kind}, ${input.body})`;
  });
}

export async function updateEntry(v: Viewer, id: string, input: EntryInput): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`update journal_entries set film_id = ${input.filmId}, kind = ${input.kind}, body = ${input.body}
              where id = ${id} and member_id = ${v.id}`;
  });
}

export async function shareEntry(v: Viewer, id: string, attribution: 'isimli' | 'anonim'): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`update journal_entries
                set visibility = 'paylasildi', attribution = ${attribution},
                    attribution_name = ${attribution === 'isimli' ? v.displayName : null}, shared_at = now()
              where id = ${id} and member_id = ${v.id}`;
  });
}

export async function unshareEntry(v: Viewer, id: string): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`update journal_entries set visibility = 'ozel', attribution_name = null, shared_at = null
              where id = ${id} and member_id = ${v.id}`;
  });
}

export async function deleteEntry(v: Viewer, id: string): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`delete from journal_entries where id = ${id} and member_id = ${v.id}`;
  });
}

// ─── contributions (after layer discussion) ────────────────────────────────
export interface Contribution {
  id: string;
  film_id: string;
  question_id: string | null;
  parent_id: string | null;
  depth: number;
  member_id: string;
  body: string;
  attribution: 'isimli' | 'anonim';
  attribution_name: string | null;
  status: 'yayinda' | 'geri_cekildi' | 'kaldirildi';
  created_at: Date;
}

export async function listContributions(v: Viewer, filmId: string): Promise<Contribution[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<Contribution[]>`
      select * from contributions where film_id = ${filmId} and status = 'yayinda'
       order by created_at`,
  );
}

export async function addContribution(
  v: Viewer,
  input: { filmId: string; questionId: string | null; parentId: string | null; body: string; attribution: 'isimli' | 'anonim' },
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`insert into contributions (film_id, question_id, parent_id, member_id, body, attribution, attribution_name)
             values (${input.filmId}, ${input.questionId}, ${input.parentId}, ${v.id}, ${input.body},
                     ${input.attribution}, ${input.attribution === 'isimli' ? v.displayName : null})`;
  });
}

export async function withdrawContribution(v: Viewer, id: string): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`update contributions set status = 'geri_cekildi' where id = ${id} and member_id = ${v.id}`;
  });
}
