import 'server-only';
import { asMember, type Tx } from '@/server/db/context';
import { actorOf, type Viewer } from '@/server/auth/viewer';
import type { FilmRow, NoteRow, QuestionRow, ResourceRow } from './films';
import type { EventRow } from './events';

// Editor desk data. Everything runs as `baglik_app` under RLS: an editor
// who reaches an admin function still gets nothing from Postgres.

async function audit(
  tx: Tx,
  action: string,
  type: string,
  id: string,
  meta: Record<string, unknown> = {},
) {
  await tx`select app.audit(${action}, ${type}, ${id}, ${tx.json(meta as never)})`;
}

// ─── films ─────────────────────────────────────────────────────────────────
export interface FilmInput {
  program_no: number | null;
  slug: string;
  title: string;
  title_original: string | null;
  year: number | null;
  director: string | null;
  runtime_min: number | null;
  runtime_source: string | null;
  country: string | null;
  language: string | null;
  intro: string | null;
  themes: string[];
  status: FilmRow['status'];
  sort_key: number | null;
  screened_on: string | null;
  curator_credit: string | null;
  reading_label: string | null;
  image_credit: string | null;
  image_rights: string | null;
}

export interface DeskFilm extends FilmRow {
  resource_count: number;
  draft_count: number;
  broken_count: number;
}

export async function deskFilms(v: Viewer): Promise<DeskFilm[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<DeskFilm[]>`
      select f.*,
        (select count(*)::int from resources r where r.film_id = f.id) as resource_count,
        (select count(*)::int from resources r where r.film_id = f.id and r.status = 'taslak') as draft_count,
        (select count(*)::int from resources r where r.film_id = f.id and r.link_status in ('kirik', 'hata')) as broken_count
      from films f
      order by coalesce(f.sort_key, f.program_no, 9999), f.created_at`,
  );
}

export async function deskFilm(v: Viewer, id: string) {
  return asMember(actorOf(v), async (tx) => {
    const [film] = await tx<FilmRow[]>`select * from films where id = ${id}`;
    if (!film) return null;
    const resources = await tx<ResourceRow[]>`
      select * from resources where film_id = ${id}
       order by layer, case section when 'okuma' then 0 when 'izleme' then 1 else 2 end, position, created_at`;
    const questions = await tx<
      QuestionRow[]
    >`select * from questions where film_id = ${id} order by layer, position, created_at`;
    const notes = await tx<NoteRow[]>`
      select id, title, body, author_credit, status, published_at from screening_notes where film_id = ${id} order by created_at`;
    return { film, resources, questions, notes };
  });
}

export async function createFilm(v: Viewer, input: FilmInput): Promise<string> {
  return asMember(actorOf(v), async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into films (program_no, slug, title, title_original, year, director, runtime_min, runtime_source, country,
        language, intro, themes, status, sort_key, screened_on, curator_credit, reading_label, image_credit, image_rights,
        created_by, updated_by)
      values (${input.program_no}, ${input.slug}, ${input.title}, ${input.title_original}, ${input.year}, ${input.director},
        ${input.runtime_min}, ${input.runtime_source}, ${input.country}, ${input.language}, ${input.intro}, ${input.themes},
        ${input.status}, ${input.sort_key}, ${input.screened_on}, ${input.curator_credit}, ${input.reading_label},
        ${input.image_credit}, ${input.image_rights}, ${v.id}, ${v.id})
      returning id`;
    await audit(tx, 'film.create', 'film', row!.id, { slug: input.slug });
    return row!.id;
  });
}

export async function updateFilm(v: Viewer, id: string, input: FilmInput): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const rows = await tx`
      update films set program_no = ${input.program_no}, slug = ${input.slug}, title = ${input.title},
        title_original = ${input.title_original}, year = ${input.year}, director = ${input.director},
        runtime_min = ${input.runtime_min}, runtime_source = ${input.runtime_source}, country = ${input.country},
        language = ${input.language}, intro = ${input.intro}, themes = ${input.themes}, status = ${input.status},
        sort_key = ${input.sort_key}, screened_on = ${input.screened_on}, curator_credit = ${input.curator_credit},
        reading_label = ${input.reading_label}, image_credit = ${input.image_credit}, image_rights = ${input.image_rights},
        updated_by = ${v.id}
      where id = ${id} returning id`;
    if (!rows.length) throw new Error('not found');
    await audit(tx, 'film.update', 'film', id);
  });
}

export async function setFilmPublication(
  v: Viewer,
  id: string,
  layer: 'film' | 'after',
  on: boolean,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    if (layer === 'film') {
      await tx`update films set published_at = ${on ? tx`now()` : null}, updated_by = ${v.id} where id = ${id}`;
    } else {
      await tx`update films set after_published_at = ${on ? tx`now()` : null}, updated_by = ${v.id} where id = ${id}`;
    }
    await audit(tx, on ? `film.publish_${layer}` : `film.unpublish_${layer}`, 'film', id);
  });
}

export async function deleteFilm(v: Viewer, id: string): Promise<boolean> {
  return asMember(actorOf(v), async (tx) => {
    const rows = await tx`delete from films where id = ${id} returning id`;
    if (rows.length) await audit(tx, 'film.delete', 'film', id);
    return rows.length > 0;
  });
}

// ─── resources ─────────────────────────────────────────────────────────────
export type ResourceInput = Omit<
  ResourceRow,
  | 'id'
  | 'film_id'
  | 'status'
  | 'link_status'
  | 'link_checked_at'
  | 'link_http_status'
  | 'updated_at'
  | 'approved_at'
  | 'link_reported_at'
  | 'link_report_count'
>;

export async function deskResource(v: Viewer, id: string) {
  return asMember(actorOf(v), async (tx) => {
    const [r] = await tx<
      (ResourceRow & { film_title: string; film_slug: string; program_no: number | null })[]
    >`
      select r.*, f.title as film_title, f.slug as film_slug, f.program_no
        from resources r join films f on f.id = r.film_id where r.id = ${id}`;
    if (!r) return null;
    const checks = await tx<
      {
        checked_at: Date;
        ok: boolean;
        http_status: number | null;
        final_url: string | null;
        error: string | null;
      }[]
    >`
      select checked_at, ok, http_status, final_url, error from link_checks where resource_id = ${id}
       order by checked_at desc limit 5`;
    return { resource: r, checks };
  });
}

export async function createResource(
  v: Viewer,
  filmId: string,
  input: ResourceInput,
): Promise<string> {
  return asMember(actorOf(v), async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into resources ${tx({ ...input, film_id: filmId, status: 'taslak', created_by: v.id, updated_by: v.id } as never)}
      returning id`;
    await audit(tx, 'resource.create', 'resource', row!.id, { film: filmId });
    return row!.id;
  });
}

export async function updateResource(v: Viewer, id: string, input: ResourceInput): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const [before] = await tx<{ url: string | null }[]>`select url from resources where id = ${id}`;
    if (!before) throw new Error('not found');
    const urlChanged = before.url !== input.url;
    await tx`update resources set ${tx({ ...input, updated_by: v.id } as never)} where id = ${id}`;
    if (urlChanged) {
      await tx`update resources set link_status = 'denetlenmedi', link_checked_at = null, link_http_status = null,
                 link_final_url = null, link_error = null where id = ${id}`;
    }
    await audit(tx, 'resource.update', 'resource', id, urlChanged ? { url_changed: true } : {});
  });
}

export async function setResourceStatus(v: Viewer, id: string, publish: boolean): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`update resources set status = ${publish ? 'yayinda' : 'taslak'},
               published_at = ${publish ? tx`coalesce(published_at, now())` : null}, updated_by = ${v.id}
             where id = ${id}`;
    await audit(tx, publish ? 'resource.publish' : 'resource.unpublish', 'resource', id);
  });
}

export async function deleteResource(v: Viewer, id: string): Promise<string | null> {
  return asMember(actorOf(v), async (tx) => {
    const [row] = await tx<
      { film_id: string }[]
    >`delete from resources where id = ${id} returning film_id`;
    if (row) await audit(tx, 'resource.delete', 'resource', id);
    return row?.film_id ?? null;
  });
}

export async function moveResource(v: Viewer, id: string, dir: -1 | 1): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const [r] = await tx<{ film_id: string; layer: string; section: string; position: number }[]>`
      select film_id, layer, section, position from resources where id = ${id}`;
    if (!r) return;
    const siblings = await tx<{ id: string }[]>`
      select id from resources where film_id = ${r.film_id} and layer = ${r.layer} and section = ${r.section}
       order by position, created_at`;
    const ids = siblings.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    for (let k = 0; k < ids.length; k++)
      await tx`update resources set position = ${k + 1} where id = ${ids[k]!}`;
  });
}

// ─── questions & notes ─────────────────────────────────────────────────────
export async function addQuestion(
  v: Viewer,
  filmId: string,
  layer: 'once' | 'sonra',
  body: string,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into questions (film_id, layer, body, position, status, created_by)
      values (${filmId}, ${layer}, ${body},
              (select coalesce(max(position), 0) + 1 from questions where film_id = ${filmId}), 'taslak', ${v.id})
      returning id`;
    await audit(tx, 'question.create', 'question', row!.id);
  });
}

export async function updateQuestion(
  v: Viewer,
  id: string,
  patch: { body?: string; status?: 'taslak' | 'yayinda' },
) {
  await asMember(actorOf(v), async (tx) => {
    if (patch.body !== undefined)
      await tx`update questions set body = ${patch.body} where id = ${id}`;
    if (patch.status !== undefined)
      await tx`update questions set status = ${patch.status} where id = ${id}`;
    await audit(
      tx,
      'question.update',
      'question',
      id,
      patch.status ? { status: patch.status } : {},
    );
  });
}

export async function deleteQuestion(v: Viewer, id: string) {
  await asMember(actorOf(v), async (tx) => {
    await tx`delete from questions where id = ${id}`;
    await audit(tx, 'question.delete', 'question', id);
  });
}

export async function saveNote(
  v: Viewer,
  filmId: string,
  id: string | null,
  input: { title: string; body: string; author_credit: string | null },
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    if (id) {
      await tx`update screening_notes set title = ${input.title}, body = ${input.body}, author_credit = ${input.author_credit}
                where id = ${id} and film_id = ${filmId}`;
      await audit(tx, 'note.update', 'screening_note', id);
    } else {
      const [row] = await tx<{ id: string }[]>`
        insert into screening_notes (film_id, title, body, author_credit, created_by)
        values (${filmId}, ${input.title}, ${input.body}, ${input.author_credit}, ${v.id}) returning id`;
      await audit(tx, 'note.create', 'screening_note', row!.id);
    }
  });
}

export async function setNoteStatus(v: Viewer, id: string, publish: boolean) {
  await asMember(actorOf(v), async (tx) => {
    await tx`update screening_notes set status = ${publish ? 'yayinda' : 'taslak'},
               published_at = ${publish ? tx`coalesce(published_at, now())` : null} where id = ${id}`;
    await audit(tx, publish ? 'note.publish' : 'note.unpublish', 'screening_note', id);
  });
}

export async function deleteNote(v: Viewer, id: string) {
  await asMember(actorOf(v), async (tx) => {
    await tx`delete from screening_notes where id = ${id}`;
    await audit(tx, 'note.delete', 'screening_note', id);
  });
}

// ─── events (owner/admin with MFA; RLS enforces it) ────────────────────────
export interface EventPrivate {
  location_text: string | null;
  location_url: string | null;
  location_directions: string | null;
  release_at: Date | null;
  released_at: Date | null;
  release_audience: 'katilanlar' | 'davetliler';
  include_in_email: boolean;
  admin_note: string | null;
}

export interface Invitee {
  member_id: string;
  display_name: string;
  email: string | null;
  member_status: string;
  status: 'davetli' | 'iptal';
  rsvp: 'geliyorum' | 'gelemiyorum' | 'belirsiz' | null;
  rsvp_note: string | null;
  rsvp_at: Date | null;
}

export async function deskEvents(v: Viewer) {
  return asMember(
    actorOf(v),
    (tx) => tx<(EventRow & { film_title: string | null; invited: number; yes: number })[]>`
      select e.*,
        (select f.title from event_films ef join films f on f.id = ef.film_id where ef.event_id = e.id order by ef.position limit 1) as film_title,
        (select count(*)::int from event_invitees i where i.event_id = e.id and i.status = 'davetli') as invited,
        (select count(*)::int from event_invitees i where i.event_id = e.id and i.status = 'davetli' and i.rsvp = 'geliyorum') as yes
      from events e order by e.starts_at desc`,
  );
}

export async function deskEvent(v: Viewer, id: string) {
  return asMember(actorOf(v), async (tx) => {
    const [event] = await tx<EventRow[]>`select * from events where id = ${id}`;
    if (!event) return null;
    const filmIds = (
      await tx<
        { film_id: string }[]
      >`select film_id from event_films where event_id = ${id} order by position`
    ).map((r) => r.film_id);
    const [priv] = await tx<EventPrivate[]>`
      select location_text, location_url, location_directions, release_at, released_at, release_audience,
             include_in_email, admin_note from event_private where event_id = ${id}`;
    const invitees = await tx<Invitee[]>`
      select i.member_id, m.display_name, m.email, m.status as member_status, i.status, i.rsvp, i.rsvp_note, i.rsvp_at
        from event_invitees i join members m on m.id = i.member_id
       where i.event_id = ${id} order by m.display_name`;
    const members = await tx<{ id: string; display_name: string }[]>`
      select id, display_name from members where status <> 'revoked'
         and id not in (select member_id from event_invitees where event_id = ${id})
       order by display_name`;
    return { event, filmIds, priv: priv ?? null, invitees, members };
  });
}

export interface EventInput {
  number: number | null;
  title: string | null;
  starts_at: Date;
  ends_at: Date | null;
  status: EventRow['status'];
  status_note: string | null;
  rsvp_deadline: Date | null;
  capacity: number | null;
  location_public_note: string;
  guest_list_visible: boolean;
  film_ids: string[];
}

export async function saveEvent(v: Viewer, id: string | null, input: EventInput): Promise<string> {
  return asMember(actorOf(v), async (tx) => {
    const { film_ids, ...fields } = input;
    let eventId = id;
    if (eventId) {
      const rows =
        await tx`update events set ${tx(fields as never)}, ics_sequence = ics_sequence + 1 where id = ${eventId} returning id`;
      if (!rows.length) throw new Error('not allowed');
    } else {
      const [row] = await tx<
        { id: string }[]
      >`insert into events ${tx({ ...fields, created_by: v.id } as never)} returning id`;
      eventId = row!.id;
      await tx`insert into event_private (event_id, updated_by) values (${eventId}, ${v.id})`;
    }
    await tx`delete from event_films where event_id = ${eventId}`;
    let pos = 0;
    for (const f of film_ids)
      await tx`insert into event_films (event_id, film_id, position) values (${eventId}, ${f}, ${pos++})`;
    await audit(tx, id ? 'event.update' : 'event.create', 'event', eventId!, {
      status: input.status,
    });
    return eventId!;
  });
}

export async function saveEventPrivate(
  v: Viewer,
  eventId: string,
  input: Omit<EventPrivate, 'released_at'>,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const rows = await tx`
      update event_private set location_text = ${input.location_text}, location_url = ${input.location_url},
        location_directions = ${input.location_directions}, release_at = ${input.release_at},
        release_audience = ${input.release_audience}, include_in_email = ${input.include_in_email},
        admin_note = ${input.admin_note}, updated_by = ${v.id}
      where event_id = ${eventId} returning event_id`;
    if (!rows.length) throw new Error('not allowed');
    // what changed is logged, never the address itself
    await audit(tx, 'location.update', 'event', eventId, {
      has_location: !!input.location_text,
      release_at: input.release_at?.toISOString() ?? null,
      audience: input.release_audience,
    });
    await tx`update events set ics_sequence = ics_sequence + 1 where id = ${eventId}`;
  });
}

export async function setLocationReleased(
  v: Viewer,
  eventId: string,
  released: boolean,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const rows = released
      ? await tx`update event_private set released_at = now(), updated_by = ${v.id} where event_id = ${eventId} returning event_id`
      : await tx`update event_private set released_at = null, release_at = null, updated_by = ${v.id} where event_id = ${eventId} returning event_id`;
    if (!rows.length) throw new Error('not allowed');
    await audit(tx, released ? 'location.release' : 'location.withdraw', 'event', eventId);
  });
}

export async function inviteMembers(
  v: Viewer,
  eventId: string,
  memberIds: string[],
): Promise<number> {
  return asMember(actorOf(v), async (tx) => {
    let n = 0;
    for (const m of memberIds) {
      const rows = await tx`
        insert into event_invitees (event_id, member_id, invited_by) values (${eventId}, ${m}, ${v.id})
        on conflict (event_id, member_id) do update set status = 'davetli'
        returning member_id`;
      n += rows.length;
    }
    await audit(tx, 'invitees.add', 'event', eventId, { count: n });
    return n;
  });
}

export async function inviteAllActive(v: Viewer, eventId: string): Promise<number> {
  return asMember(actorOf(v), async (tx) => {
    const rows = await tx`
      insert into event_invitees (event_id, member_id, invited_by)
      select ${eventId}, id, ${v.id} from members where status = 'active'
      on conflict (event_id, member_id) do nothing returning member_id`;
    await audit(tx, 'invitees.add_all', 'event', eventId, { count: rows.length });
    return rows.length;
  });
}

export async function setInviteStatus(
  v: Viewer,
  eventId: string,
  memberId: string,
  status: 'davetli' | 'iptal',
) {
  await asMember(actorOf(v), async (tx) => {
    await tx`update event_invitees set status = ${status} where event_id = ${eventId} and member_id = ${memberId}`;
    await audit(tx, status === 'iptal' ? 'invitee.cancel' : 'invitee.restore', 'event', eventId, {
      member: memberId,
    });
  });
}

/** Recipients for a location notice: those the release rule lets see it. */
export async function locationRecipients(v: Viewer, eventId: string) {
  return asMember(
    actorOf(v),
    (tx) => tx<{ member_id: string; email: string | null; display_name: string }[]>`
      select i.member_id, m.email, m.display_name
        from event_invitees i join members m on m.id = i.member_id and m.status = 'active'
        join event_private p on p.event_id = i.event_id
       where i.event_id = ${eventId} and i.status = 'davetli'
         and (p.release_audience = 'davetliler' or i.rsvp = 'geliyorum')`,
  );
}

export async function reminderRecipients(v: Viewer, eventId: string) {
  return asMember(
    actorOf(v),
    (tx) => tx<{ member_id: string; email: string | null; display_name: string }[]>`
      select i.member_id, m.email, m.display_name
        from event_invitees i join members m on m.id = i.member_id and m.status = 'active'
       where i.event_id = ${eventId} and i.status = 'davetli' and coalesce(i.rsvp, 'belirsiz') <> 'gelemiyorum'`,
  );
}

// ─── members (owner/admin with MFA) ────────────────────────────────────────
export interface DeskMember {
  id: string;
  display_name: string;
  email: string | null;
  role: 'owner' | 'admin' | 'editor' | 'member';
  status: 'invited' | 'active' | 'revoked';
  created_at: Date;
  activated_at: Date | null;
  revoked_at: Date | null;
}

export async function deskMembers(v: Viewer): Promise<DeskMember[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<DeskMember[]>`
      select id, display_name, email, role, status, created_at, activated_at, revoked_at from members
       order by case status when 'active' then 0 when 'invited' then 1 else 2 end, display_name`,
  );
}

export async function deskMember(v: Viewer, id: string): Promise<DeskMember | null> {
  const [m] = await asMember(
    actorOf(v),
    (tx) => tx<DeskMember[]>`
      select id, display_name, email, role, status, created_at, activated_at, revoked_at from members where id = ${id}`,
  );
  return m ?? null;
}

export async function createMember(
  v: Viewer,
  input: { display_name: string; email: string | null; role: DeskMember['role'] },
): Promise<string> {
  return asMember(actorOf(v), async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into members (display_name, email, role, created_by)
      values (${input.display_name}, ${input.email}, ${input.role}, ${v.id}) returning id`;
    await audit(tx, 'member.create', 'member', row!.id, { role: input.role });
    return row!.id;
  });
}

export async function updateMember(
  v: Viewer,
  id: string,
  input: { display_name: string; email: string | null; role: DeskMember['role'] },
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const rows =
      await tx`update members set display_name = ${input.display_name}, email = ${input.email}, role = ${input.role}
                           where id = ${id} returning id`;
    if (!rows.length) throw new Error('not allowed');
    await audit(tx, 'member.update', 'member', id, { role: input.role });
  });
}

/** KVKK erasure: removes the member and cascades their notes, RSVPs, sessions. */
export async function deleteMember(v: Viewer, id: string): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    if (id === v.id) throw new Error('cannot delete yourself');
    const rows = await tx`delete from members where id = ${id} and role <> 'owner'
                           and (role <> 'admin' or app.role() = 'owner') returning id`;
    if (!rows.length) throw new Error('not allowed');
    await audit(tx, 'member.delete', 'member', id);
  });
}

// ─── operations ────────────────────────────────────────────────────────────
export async function auditLog(v: Viewer, limit = 200) {
  return asMember(
    actorOf(v),
    (tx) => tx<
      {
        id: number;
        at: Date;
        actor: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        meta: Record<string, unknown>;
      }[]
    >`
      select a.id, a.at, m.display_name as actor, a.action, a.target_type, a.target_id, a.meta
        from audit_logs a left join members m on m.id = a.actor_id
       order by a.at desc limit ${limit}`,
  );
}

export async function deliveries(v: Viewer, limit = 100) {
  return asMember(
    actorOf(v),
    (tx) => tx<
      {
        id: string;
        kind: string;
        status: string;
        channel: string;
        created_at: Date;
        sent_at: Date | null;
        error: string | null;
        member: string | null;
      }[]
    >`
      select d.id, d.kind, d.status, d.channel, d.created_at, d.sent_at, d.error, m.display_name as member
        from notification_deliveries d left join members m on m.id = d.member_id
       order by d.created_at desc limit ${limit}`,
  );
}

export async function linkHealth(v: Viewer) {
  return asMember(
    actorOf(v),
    (tx) => tx<(ResourceRow & { film_title: string; program_no: number | null })[]>`
      select r.*, f.title as film_title, f.program_no from resources r join films f on f.id = r.film_id
       where r.url is not null
       order by case r.link_status when 'kirik' then 0 when 'hata' then 1 when 'yonlendirme' then 2
                when 'denetlenmedi' then 3 else 4 end, f.program_no, r.position`,
  );
}

export async function deskSummary(v: Viewer) {
  return asMember(actorOf(v), async (tx) => {
    const [c] = await tx<{ films: number; drafts: number; broken: number; unchecked: number }[]>`
      select (select count(*)::int from films) as films,
             (select count(*)::int from resources where status = 'taslak') as drafts,
             (select count(*)::int from resources where link_status in ('kirik', 'hata')) as broken,
             (select count(*)::int from resources where link_status = 'denetlenmedi' and url is not null) as unchecked`;
    return c!;
  });
}

// ─── moderation (owner/admin with MFA; enforced inside the SQL functions) ──
export async function moderateContribution(v: Viewer, id: string, state: 'yayinda' | 'kaldirildi') {
  await asMember(actorOf(v), (tx) => tx`select app.moderate_contribution(${id}, ${state})`);
}

export async function moderateJournal(v: Viewer, id: string, state: 'gorunur' | 'gizlendi') {
  await asMember(actorOf(v), (tx) => tx`select app.moderate_journal(${id}, ${state})`);
}
