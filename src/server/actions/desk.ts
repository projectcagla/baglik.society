'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { DESK_ERRORS, type DeskErrorCode } from '@/lib/desk-errors';
import { safeReturnPath } from '@/lib/return-path';
import { istanbulLocalToDate } from '@/lib/dates';
import { filmSlug } from '@/lib/text';
import { endAllSessionsFor, issueInvite, restoreMember, revokeMember } from '@/server/auth/door';
import { beginEnrollment, resetMfa, verifyMfa } from '@/server/auth/mfa';
import { requireAdmin, requireMember, requireStaff } from '@/server/auth/viewer';
import * as desk from '@/server/dal/desk';
import { checkLinks } from '@/server/system/link-check';
import { deliver, mailConfigured } from '@/server/system/mail';
import { env } from '@/server/env';
import { formatEventDate } from '@/lib/dates';
import { brandLower } from '@/lib/text';

export interface DeskState {
  ok: boolean;
  message: string | null;
  /** one-time secrets (invite codes) shown once after creation */
  secrets?: { name: string; code: string }[];
}

const uuid = z.string().uuid();
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional()
    .transform((s) => s ?? null);
const optInt = (min: number, max: number) =>
  z
    .union([z.literal(''), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v));
const optUrl = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .url()
      .max(2000)
      .regex(/^https?:\/\//, 'yalnızca http(s) bağlantısı'),
  ])
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Runs a desk write whose refusal is an editorial rule (enforced by the
 * database), returning the rule's code for the page to explain; anything
 * else is rethrown.
 */
async function deskErrorCode(write: () => Promise<unknown>): Promise<DeskErrorCode | null> {
  try {
    await write();
    return null;
  } catch (err) {
    const m = err instanceof Error ? err.message : '';
    if (m.includes('after layer requires a screening')) return 'sonra-erken';
    if (m.includes('resources_no_spoiler_before')) return 'spoiler-once';
    throw err;
  }
}

function fail(err: unknown, fallback = 'kaydedilemedi.'): DeskState {
  const m = err instanceof Error ? err.message : '';
  if (m.includes('resources_no_spoiler_before'))
    return { ok: false, message: DESK_ERRORS['spoiler-once'] };
  if (m.includes('duplicate key') && m.includes('slug'))
    return { ok: false, message: 'bu adres (slug) başka bir filmde kullanılıyor.' };
  if (m.includes('duplicate key') && m.includes('program_no'))
    return { ok: false, message: 'bu program numarası kullanılıyor.' };
  if (m.includes('duplicate key') && m.includes('number'))
    return { ok: false, message: 'bu gece numarası kullanılıyor.' };
  if (m.includes('members_email_key'))
    return { ok: false, message: 'bu e-posta başka bir üyede kayıtlı.' };
  if (m.includes('only an owner'))
    return { ok: false, message: 'yönetici rolleri yalnızca kurucu tarafından değiştirilebilir.' };
  if (
    m.includes('not allowed') ||
    m.includes('row-level security') ||
    m.includes('permission denied')
  ) {
    return { ok: false, message: 'bu işlem için yetkin yok.' };
  }
  console.error('[desk]', m);
  return { ok: false, message: fallback };
}

// ─── films ─────────────────────────────────────────────────────────────────
const filmSchema = z.object({
  program_no: optInt(1, 9999),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'slug: küçük harf, rakam ve tire')
    .optional(),
  title: z.string().trim().min(1, 'film adı gerekli.').max(160),
  title_original: opt(200),
  year: optInt(1880, 2100),
  director: opt(160),
  runtime_min: optInt(1, 1000),
  runtime_source: opt(300),
  country: opt(120),
  language: opt(120),
  intro: opt(4000),
  themes: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    ),
  status: z.enum(['oneri', 'secildi', 'yaklasiyor', 'izlendi', 'arsiv']),
  sort_key: optInt(-9999, 9999),
  screened_on: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((v) => v || null),
  curator_credit: opt(160),
  reading_label: opt(80),
  image_credit: opt(300),
  image_rights: opt(300),
});

function parseFilm(form: FormData) {
  const parsed = filmSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'form geçersiz.' } as const;
  const d = parsed.data;
  return {
    input: { ...d, slug: d.slug || filmSlug(d.program_no, d.title) } as desk.FilmInput,
  } as const;
}

export async function createFilmAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireStaff();
  const p = parseFilm(form);
  if ('error' in p) return { ok: false, message: p.error ?? null };
  let id: string;
  try {
    id = await desk.createFilm(v, p.input);
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/filmler');
  redirect(`/masa/filmler/${id}`);
}

export async function updateFilmAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireStaff();
  const id = uuid.parse(form.get('id'));
  const p = parseFilm(form);
  if ('error' in p) return { ok: false, message: p.error ?? null };
  try {
    await desk.updateFilm(v, id, p.input);
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'kaydedildi.' };
}

export async function filmPublicationAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  const id = uuid.parse(form.get('id'));
  const layer = z.enum(['film', 'after']).parse(form.get('layer'));
  const on = form.get('on') === '1';
  const code = await deskErrorCode(() => desk.setFilmPublication(v, id, layer, on));
  revalidatePath('/', 'layout');
  if (code) redirect(`/masa/filmler/${id}?hata=${code}`);
}

export async function deleteFilmAction(form: FormData): Promise<void> {
  const v = await requireAdmin();
  const id = uuid.parse(form.get('id'));
  if (form.get('confirm') !== 'sil') return;
  await desk.deleteFilm(v, id);
  revalidatePath('/', 'layout');
  redirect('/masa/filmler');
}

// ─── resources ─────────────────────────────────────────────────────────────
const resourceSchema = z
  .object({
    layer: z.enum(['once', 'sonra']),
    section: z.enum(['okuma', 'izleme', 'eslik']),
    position: optInt(0, 999),
    kind: z.enum([
      'article',
      'interview',
      'video',
      'podcast',
      'music',
      'essay',
      'book',
      'film',
      'official',
      'other',
    ]),
    heading: opt(200),
    title_original: opt(300),
    author: opt(200),
    publication: opt(200),
    form_label: opt(80),
    language: opt(12),
    published_year: optInt(1800, 2100),
    duration_note: opt(40),
    url: optUrl,
    link_label: opt(60),
    link_hint: opt(160),
    access_note: opt(300),
    spoiler_level: z.enum(['yok', 'hafif', 'var', 'belirtilmedi']),
    rationale: opt(600),
    note: opt(6000),
    prompt: opt(300),
    source_minutes: optInt(1, 600),
    provenance: opt(200),
    review_note: opt(500),
    quote: opt(600),
    quote_credit: opt(200),
    rights_status: z.enum(['baglanti', 'ozgun_ozet', 'lisansli_ceviri', 'kendi_icerigi']),
    rights_note: opt(500),
  })
  .refine((d) => d.heading || d.title_original, {
    message: 'başlık ya da özgün başlıktan biri gerekli.',
  })
  .refine((d) => d.rights_status !== 'lisansli_ceviri' || !!d.rights_note, {
    message: 'lisanslı çeviri için hak notu (izin/lisans kaynağı) zorunlu.',
  });

export async function saveResourceAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireStaff();
  const parsed = resourceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'form geçersiz.' };
  const input = { ...parsed.data, position: parsed.data.position ?? 0 } as desk.ResourceInput;
  const id = form.get('id');
  let target: string;
  try {
    if (typeof id === 'string' && id) {
      await desk.updateResource(v, uuid.parse(id), input);
      target = id;
    } else {
      target = await desk.createResource(v, uuid.parse(form.get('filmId')), input);
    }
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/', 'layout');
  if (!id) redirect(`/masa/kaynaklar/${target}?yeni=1`);
  return { ok: true, message: 'kaydedildi.' };
}

export async function resourceStatusAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  const id = uuid.parse(form.get('id'));
  const code = await deskErrorCode(() => desk.setResourceStatus(v, id, form.get('on') === '1'));
  revalidatePath('/', 'layout');
  if (code) redirect(`/masa/kaynaklar/${id}?hata=${code}`);
}

export async function moveResourceAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  await desk.moveResource(v, uuid.parse(form.get('id')), form.get('dir') === 'up' ? -1 : 1);
  revalidatePath('/', 'layout');
}

export async function deleteResourceAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  const filmId = await desk.deleteResource(v, uuid.parse(form.get('id')));
  revalidatePath('/', 'layout');
  redirect(filmId ? `/masa/filmler/${filmId}` : '/masa/filmler');
}

export async function checkLinkAction(form: FormData): Promise<void> {
  await requireStaff();
  const ids = form
    .getAll('id')
    .filter((x): x is string => typeof x === 'string' && uuid.safeParse(x).success);
  await checkLinks(ids.length ? { ids, limit: 10 } : { limit: 15, staleHours: 0 });
  revalidatePath('/masa', 'layout');
}

// ─── questions & notes ─────────────────────────────────────────────────────
export async function questionAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  const op = z.enum(['add', 'publish', 'unpublish', 'delete', 'edit']).parse(form.get('op'));
  const filmId = uuid.parse(form.get('filmId'));
  if (op === 'add') {
    const body = z.string().trim().min(1).max(400).parse(form.get('body'));
    await desk.addQuestion(v, filmId, z.enum(['once', 'sonra']).parse(form.get('layer')), body);
  } else {
    const id = uuid.parse(form.get('id'));
    if (op === 'delete') await desk.deleteQuestion(v, id);
    else if (op === 'edit')
      await desk.updateQuestion(v, id, {
        body: z.string().trim().min(1).max(400).parse(form.get('body')),
      });
    else await desk.updateQuestion(v, id, { status: op === 'publish' ? 'yayinda' : 'taslak' });
  }
  revalidatePath('/', 'layout');
}

export async function saveNoteAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireStaff();
  const parsed = z
    .object({
      filmId: uuid,
      id: z.union([uuid, z.literal('')]).optional(),
      title: z.string().trim().min(1).max(160),
      body: z.string().max(20000),
      author_credit: opt(160),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'başlık gerekli.' };
  try {
    await desk.saveNote(v, parsed.data.filmId, parsed.data.id || null, {
      title: parsed.data.title,
      body: parsed.data.body,
      author_credit: parsed.data.author_credit,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/', 'layout');
  return {
    ok: true,
    message: 'kaydedildi (taslak olarak kalır, yayımlayana kadar üyeler görmez).',
  };
}

export async function noteStatusAction(form: FormData): Promise<void> {
  const v = await requireStaff();
  const id = uuid.parse(form.get('id'));
  const op = form.get('op');
  if (op === 'delete') await desk.deleteNote(v, id);
  else await desk.setNoteStatus(v, id, op === 'publish');
  revalidatePath('/', 'layout');
}

// ─── events (admin + MFA) ──────────────────────────────────────────────────
const localDate = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return null;
    const d = istanbulLocalToDate(s);
    if (!d) ctx.addIssue({ code: 'custom', message: 'tarih/saat geçersiz.' });
    return d;
  });

const eventSchema = z.object({
  number: optInt(1, 9999),
  title: opt(160),
  starts_at: z.string().min(1, 'başlangıç zamanı gerekli.'),
  ends_at: localDate,
  status: z.enum(['taslak', 'davet', 'ertelendi', 'iptal', 'tamamlandi']),
  status_note: opt(300),
  rsvp_deadline: localDate,
  capacity: optInt(1, 500),
  location_public_note: z.string().trim().min(1).max(200),
  guest_list_visible: z
    .string()
    .optional()
    .transform((v) => v === '1'),
});

export async function saveEventAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'form geçersiz.' };
  const starts = istanbulLocalToDate(parsed.data.starts_at);
  if (!starts) return { ok: false, message: 'başlangıç zamanı geçersiz.' };
  const filmIds = form
    .getAll('film_ids')
    .filter((x): x is string => typeof x === 'string' && uuid.safeParse(x).success);
  const id = form.get('id');
  let eventId: string;
  try {
    eventId = await desk.saveEvent(v, typeof id === 'string' && id ? id : null, {
      ...parsed.data,
      starts_at: starts,
      film_ids: filmIds,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/', 'layout');
  if (!id) redirect(`/masa/geceler/${eventId}`);
  return {
    ok: true,
    message: 'kaydedildi. davetlilerin takvim dosyası bir sonraki indirmede güncellenir.',
  };
}

const privateSchema = z.object({
  eventId: uuid,
  location_text: opt(300),
  location_url: optUrl,
  location_directions: opt(600),
  release_at: localDate,
  release_audience: z.enum(['katilanlar', 'davetliler']),
  include_in_email: z
    .string()
    .optional()
    .transform((v) => v === '1'),
  admin_note: opt(1000),
});

export async function saveLocationAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const parsed = privateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'form geçersiz.' };
  const { eventId, ...rest } = parsed.data;
  try {
    await desk.saveEventPrivate(v, eventId, rest);
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'konum ayarları kaydedildi.' };
}

export async function releaseLocationAction(form: FormData): Promise<void> {
  const v = await requireAdmin();
  await desk.setLocationReleased(v, uuid.parse(form.get('eventId')), form.get('op') === 'release');
  revalidatePath('/', 'layout');
}

export async function inviteesAction(form: FormData): Promise<void> {
  const v = await requireAdmin();
  const eventId = uuid.parse(form.get('eventId'));
  const op = z.enum(['add', 'all', 'cancel', 'restore']).parse(form.get('op'));
  if (op === 'add') {
    const ids = form
      .getAll('memberIds')
      .filter((x): x is string => typeof x === 'string' && uuid.safeParse(x).success);
    if (ids.length) await desk.inviteMembers(v, eventId, ids);
  } else if (op === 'all') {
    await desk.inviteAllActive(v, eventId);
  } else {
    await desk.setInviteStatus(
      v,
      eventId,
      uuid.parse(form.get('memberId')),
      op === 'cancel' ? 'iptal' : 'davetli',
    );
  }
  revalidatePath('/', 'layout');
}

/**
 * Manual notices. Sends only through a configured provider and records the
 * true delivery status per member. The location itself goes into the e-mail
 * only when the admin ticked "e-postaya konumu ekle".
 */
export async function notifyAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const eventId = uuid.parse(form.get('eventId'));
  const kind = z.enum(['konum', 'hatirlatma']).parse(form.get('kind'));
  const detail = await desk.deskEvent(v, eventId);
  if (!detail) return { ok: false, message: 'gece bulunamadı.' };
  const { event, priv } = detail;
  const origin = env().APP_ORIGIN ?? '';
  const night = event.number ? `${event.number}. film gecesi` : 'film gecesi';
  const released =
    !!priv &&
    ((priv.released_at && priv.released_at <= new Date()) ||
      (priv.release_at && priv.release_at <= new Date()));
  if (kind === 'konum' && (!released || !priv?.location_text)) {
    return { ok: false, message: 'konum henüz açılmadı ya da girilmedi; bildirim gönderilmedi.' };
  }
  const recipients =
    kind === 'konum'
      ? await desk.locationRecipients(v, eventId)
      : await desk.reminderRecipients(v, eventId);
  const counts: Record<string, number> = {};
  for (const r of recipients) {
    const text =
      kind === 'konum'
        ? priv?.include_in_email
          ? `${night} için konum:\n\n${priv.location_text}\n${priv.location_directions ?? ''}\n\n${origin}/geceler/${event.number}`
          : `${night} için konum paylaşıldı. görmek için giriş yap:\n\n${origin}/geceler/${event.number}`
        : `hatırlatma: ${night} — ${formatEventDate(event.starts_at)}.\n\n${origin}/geceler/${event.number}`;
    const status = await deliver({
      to: r.email,
      kind,
      memberId: r.member_id,
      eventId,
      actorId: v.id,
      subject:
        kind === 'konum'
          ? `bağlık.society · ${night}`
          : `bağlık.society · ${brandLower(night)} yaklaşıyor`,
      text,
    });
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([k, n]) => `${n} ${k.replace('_', ' ')}`)
    .join(', ');
  return {
    ok: true,
    message: recipients.length
      ? `${recipients.length} kişi: ${summary}.${mailConfigured() ? '' : ' e-posta sağlayıcısı tanımlı değil; hiçbir şey gönderilmedi.'}`
      : 'uygun alıcı yok.',
  };
}

// ─── members (admin + MFA) ─────────────────────────────────────────────────
const memberSchema = z.object({
  display_name: z.string().trim().min(1, 'ad gerekli.').max(80),
  email: z
    .union([z.literal(''), z.string().trim().email('e-posta geçersiz.').max(200)])
    .transform((v) => v || null),
  role: z.enum(['owner', 'admin', 'editor', 'member']),
});

export async function createMemberAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const parsed = memberSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'form geçersiz.' };
  try {
    const id = await desk.createMember(v, parsed.data);
    const eventId = form.get('inviteTo');
    if (typeof eventId === 'string' && uuid.safeParse(eventId).success)
      await desk.inviteMembers(v, eventId, [id]);
    const code = await issueInvite(id, v.id);
    revalidatePath('/masa/uyeler');
    return {
      ok: true,
      message: 'üye eklendi. davet kodu yalnızca şimdi gösteriliyor.',
      secrets: [{ name: parsed.data.display_name, code }],
    };
  } catch (err) {
    return fail(err);
  }
}

/** "ad, e-posta" per line → members + one-time codes, shown once. */
export async function importMembersAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const lines = String(form.get('lines') ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);
  const eventId = form.get('inviteTo');
  const secrets: { name: string; code: string }[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const [name, email] = line.split(/[,;\t]/).map((s) => s.trim());
    const parsed = memberSchema.safeParse({
      display_name: name ?? '',
      email: email ?? '',
      role: 'member',
    });
    if (!parsed.success) {
      errors.push(line);
      continue;
    }
    try {
      const id = await desk.createMember(v, parsed.data);
      if (typeof eventId === 'string' && uuid.safeParse(eventId).success)
        await desk.inviteMembers(v, eventId, [id]);
      secrets.push({ name: parsed.data.display_name, code: await issueInvite(id, v.id) });
    } catch {
      errors.push(line);
    }
  }
  revalidatePath('/masa/uyeler');
  return {
    ok: secrets.length > 0,
    message: `${secrets.length} üye eklendi.${errors.length ? ` eklenemeyen satırlar: ${errors.join(' | ')}` : ''}`,
    secrets,
  };
}

export async function updateMemberAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const id = uuid.parse(form.get('id'));
  const parsed = memberSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'form geçersiz.' };
  try {
    await desk.updateMember(v, id, parsed.data);
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/masa/uyeler');
  return { ok: true, message: 'kaydedildi.' };
}

export async function memberOpAction(_prev: DeskState, form: FormData): Promise<DeskState> {
  const v = await requireAdmin();
  const id = uuid.parse(form.get('id'));
  const op = z
    .enum(['invite', 'sessions', 'revoke', 'restore', 'mfa-reset', 'delete'])
    .parse(form.get('op'));
  try {
    switch (op) {
      case 'invite': {
        const code = await issueInvite(id, v.id);
        return {
          ok: true,
          message: 'yeni tek kullanımlık davet kodu. önceki kullanılmamış kodlar geçersiz.',
          secrets: [{ name: 'kod', code }],
        };
      }
      case 'sessions': {
        const n = await endAllSessionsFor(id, v.id);
        revalidatePath('/masa/uyeler');
        return { ok: true, message: `${n} oturum kapatıldı.` };
      }
      case 'revoke':
        await revokeMember(id, v.id);
        revalidatePath('/masa/uyeler');
        return { ok: true, message: 'üyelik iptal edildi; tüm kodları ve oturumları geçersiz.' };
      case 'restore':
        await restoreMember(id, v.id);
        revalidatePath('/masa/uyeler');
        return { ok: true, message: 'üyelik geri açıldı. girebilmesi için yeni davet kodu ver.' };
      case 'mfa-reset':
        await resetMfa(id, v.id);
        return { ok: true, message: 'ikinci doğrulama sıfırlandı.' };
      case 'delete':
        if (form.get('confirm') !== 'sil')
          return { ok: false, message: 'silmek için kutuya “sil” yaz.' };
        await desk.deleteMember(v, id);
        break;
    }
  } catch (err) {
    return fail(err, 'işlem yapılamadı.');
  }
  revalidatePath('/masa/uyeler');
  redirect('/masa/uyeler');
}

// ─── MFA (step-up for owner/admin) ─────────────────────────────────────────
export interface MfaState {
  message: string | null;
  secret?: string;
  uri?: string;
  qr?: string;
}

export async function startMfaAction(): Promise<MfaState> {
  const v = await requireMember();
  if (!v.isAdmin) return { message: 'yalnızca yöneticiler için.' };
  try {
    const { secret, uri } = await beginEnrollment(v.id, v.email ?? v.displayName);
    const QR = await import('qrcode');
    // PNG data URL rendered with <img>; no markup injection path
    const qr = await QR.toDataURL(uri, {
      margin: 1,
      width: 240,
      color: { dark: '#F2EEF3', light: '#0A0A0C' },
    });
    return { message: null, secret, uri, qr };
  } catch {
    return { message: 'kurulum başlatılamadı (zaten etkin olabilir).' };
  }
}

export async function verifyMfaAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const v = await requireMember();
  if (!v.isAdmin) return { message: 'yalnızca yöneticiler için.' };
  const code = String(form.get('code') ?? '').replace(/\s/g, '');
  const result = await verifyMfa(v.id, v.sessionId, code);
  if (result === 'throttled') return { message: 'çok fazla deneme. 15 dakika sonra yeniden dene.' };
  if (result === 'invalid') return { message: 'kod doğrulanamadı.' };
  const back = safeReturnPath(String(form.get('r') ?? ''));
  redirect(back?.startsWith('/masa') ? back : '/masa');
}

// ─── moderation ────────────────────────────────────────────────────────────
export async function moderateAction(form: FormData): Promise<void> {
  const v = await requireAdmin();
  const id = uuid.parse(form.get('id'));
  const what = z.enum(['contribution', 'journal']).parse(form.get('what'));
  // every moderation step can be undone, and each one is written to the audit log
  const restore = form.get('op') === 'restore';
  const path = safeReturnPath(String(form.get('path') ?? ''));
  if (what === 'contribution')
    await desk.moderateContribution(v, id, restore ? 'yayinda' : 'kaldirildi');
  else await desk.moderateJournal(v, id, restore ? 'gorunur' : 'gizlendi');
  if (path) revalidatePath(path);
}
