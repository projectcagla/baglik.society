'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hasPersonalKey, rotatePersonalKey, endAllSessionsFor } from '@/server/auth/door';
import {
  clearSessionCookie,
  readSessionToken,
  revokeOwnSession,
  revokeSessionByToken,
} from '@/server/auth/session';
import { requireMember } from '@/server/auth/viewer';
import { setRsvp } from '@/server/dal/events';
import { reportLink, setMark } from '@/server/dal/films';
import { safeReturnPath } from '@/lib/return-path';
import {
  addContribution,
  createEntry,
  deleteEntry,
  shareEntry,
  unshareEntry,
  updateEntry,
  withdrawContribution,
} from '@/server/dal/journal';
import { updateOwnProfile } from '@/server/dal/profile';

// Every action re-checks the session itself; Server Actions are public HTTP
// endpoints no matter which page renders them.

export interface ActionState {
  ok: boolean;
  message: string | null;
}

const uuid = z.string().uuid();

function pgMessage(err: unknown): string | null {
  const m = err instanceof Error ? err.message : '';
  if (m.includes('rsvp deadline')) return 'katılım bildirme süresi doldu.';
  if (m.includes('capacity')) return 'bu gece için yer kalmadı.';
  if (m.includes('event closed')) return 'bu gece için katılım bildirimi kapalı.';
  if (m.includes('not invited')) return 'bu geceye davetli görünmüyorsun.';
  return null;
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await revokeSessionByToken(token);
  await clearSessionCookie();
  redirect('/');
}

// ─── RSVP ──────────────────────────────────────────────────────────────────
const rsvpSchema = z.object({
  eventId: uuid,
  rsvp: z.enum(['geliyorum', 'gelemiyorum', 'belirsiz']),
  note: z.string().trim().max(280).optional(),
  path: z.string().startsWith('/').max(200).optional(),
});

export async function rsvpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await requireMember();
  const parsed = rsvpSchema.safeParse({
    eventId: form.get('eventId'),
    rsvp: form.get('rsvp'),
    note: form.get('note') ?? undefined,
    path: form.get('path') ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: 'bir seçenek işaretle.' };
  try {
    await setRsvp(v, parsed.data.eventId, parsed.data.rsvp, parsed.data.note || null);
  } catch (err) {
    return { ok: false, message: pgMessage(err) ?? 'kaydedilemedi. yeniden dene.' };
  }
  revalidatePath('/oda');
  revalidatePath('/geceler', 'layout');
  // repeating the same answer is harmless: the database stores one row per invitee
  const label = {
    geliyorum: 'geliyorum',
    gelemiyorum: 'gelemiyorum',
    belirsiz: 'henüz belli değil',
  };
  return { ok: true, message: `kaydedildi: ${label[parsed.data.rsvp]}.` };
}

// ─── reading marks ─────────────────────────────────────────────────────────
export async function markAction(form: FormData): Promise<void> {
  const v = await requireMember();
  const parsed = z
    .object({
      resourceId: uuid,
      field: z.enum(['read', 'saved']),
      on: z.enum(['1', '0']),
      path: z.string().startsWith('/'),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await setMark(v, parsed.data.resourceId, parsed.data.field, parsed.data.on === '1');
  // only known member sections are revalidated; anything else is ignored
  const path = safeReturnPath(parsed.data.path);
  if (path) revalidatePath(path);
}

/** A member flags a source link that does not open; the desk sees it. */
export async function reportLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await requireMember();
  const id = uuid.safeParse(form.get('resourceId'));
  if (!id.success) return { ok: false, message: null };
  try {
    await reportLink(v, id.data);
  } catch {
    return { ok: false, message: 'bildirilemedi.' };
  }
  return { ok: true, message: 'bildirildi.' };
}

// ─── journal ───────────────────────────────────────────────────────────────
const entrySchema = z.object({
  filmId: z.union([uuid, z.literal('')]).optional(),
  kind: z.enum(['beklenti', 'hatira', 'serbest']),
  body: z.string().trim().min(1, 'boş not kaydedilmez.').max(5000),
});

export async function saveEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await requireMember();
  const parsed = entrySchema.safeParse({
    filmId: form.get('filmId') ?? '',
    kind: form.get('kind'),
    body: form.get('body'),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'kaydedilemedi.' };
  const input = {
    filmId: parsed.data.filmId || null,
    kind: parsed.data.kind,
    body: parsed.data.body,
  };
  const id = form.get('id');
  if (typeof id === 'string' && id) {
    if (!uuid.safeParse(id).success) return { ok: false, message: 'kaydedilemedi.' };
    await updateEntry(v, id, input);
  } else {
    await createEntry(v, input);
  }
  revalidatePath('/defter');
  return { ok: true, message: 'not kaydedildi. yalnızca sen görebilirsin.' };
}

export async function entryVisibilityAction(form: FormData): Promise<void> {
  const v = await requireMember();
  const id = uuid.parse(form.get('id'));
  const op = z.enum(['share-named', 'share-anon', 'unshare', 'delete']).parse(form.get('op'));
  if (op === 'share-named') await shareEntry(v, id, 'isimli');
  else if (op === 'share-anon') await shareEntry(v, id, 'anonim');
  else if (op === 'unshare') await unshareEntry(v, id);
  else await deleteEntry(v, id);
  revalidatePath('/defter');
}

// ─── after-layer contributions ─────────────────────────────────────────────
const contributionSchema = z.object({
  filmId: uuid,
  questionId: z.union([uuid, z.literal('')]).optional(),
  parentId: z.union([uuid, z.literal('')]).optional(),
  body: z.string().trim().min(1).max(1200),
  attribution: z.enum(['isimli', 'anonim']),
  path: z.string().startsWith('/').max(200),
});

export async function contributionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await requireMember();
  const parsed = contributionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'düşünceni yaz (en çok 1200 karakter).' };
  try {
    await addContribution(v, {
      filmId: parsed.data.filmId,
      questionId: parsed.data.questionId || null,
      parentId: parsed.data.parentId || null,
      body: parsed.data.body,
      attribution: parsed.data.attribution,
    });
  } catch {
    return { ok: false, message: 'bu bölüm şu an katkıya açık değil.' };
  }
  const back = safeReturnPath(parsed.data.path);
  if (back) revalidatePath(back);
  return { ok: true, message: 'eklendi.' };
}

export async function withdrawContributionAction(form: FormData): Promise<void> {
  const v = await requireMember();
  const id = uuid.parse(form.get('id'));
  const path = safeReturnPath(String(form.get('path') ?? ''));
  await withdrawContribution(v, id);
  if (path) revalidatePath(path);
}

// ─── profile & keys ────────────────────────────────────────────────────────
const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'adını yaz.').max(80),
  email: z.union([
    z.string().trim().email('e-posta adresi geçerli değil.').max(200),
    z.literal(''),
  ]),
});

export async function profileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await requireMember();
  const parsed = profileSchema.safeParse({
    displayName: form.get('displayName'),
    email: form.get('email') ?? '',
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'kaydedilemedi.' };
  try {
    await updateOwnProfile(v, parsed.data.displayName, parsed.data.email || null);
  } catch {
    return { ok: false, message: 'bu e-posta adresi kullanılamıyor.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'kaydedildi.' };
}

export interface KeyState {
  code: string | null;
  message: string | null;
}

/** Creates a new personal key and returns it once. Old keys stop working. */
export async function createKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  const v = await requireMember();
  if (form.get('confirm') !== '1' && (await hasPersonalKey(v.id))) {
    return { code: null, message: 'yeni anahtar eskisini geçersiz kılar. onay kutusunu işaretle.' };
  }
  const code = await rotatePersonalKey(v.id);
  return { code, message: null };
}

/** Signs out every other device; this browser stays in. */
export async function endOtherSessionsAction(): Promise<void> {
  const v = await requireMember();
  await endAllSessionsFor(v.id, v.id, v.sessionId);
  revalidatePath('/profil');
}

export async function revokeSessionAction(form: FormData): Promise<void> {
  const v = await requireMember();
  const id = uuid.parse(form.get('sessionId'));
  if (id === v.sessionId) return;
  await revokeOwnSession(v.id, id);
  revalidatePath('/profil');
}
