import 'server-only';
import { asMember } from '@/server/db/context';
import { actorOf, type Viewer } from '@/server/auth/viewer';

export interface FilmRow {
  id: string;
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
  status: 'oneri' | 'secildi' | 'yaklasiyor' | 'izlendi' | 'arsiv';
  sort_key: number | null;
  screened_on: Date | null;
  curator_credit: string | null;
  reading_label: string | null;
  image_credit: string | null;
  image_rights: string | null;
  published_at: Date | null;
  after_published_at: Date | null;
  updated_at: Date;
}

export interface ResourceRow {
  id: string;
  film_id: string;
  layer: 'once' | 'sonra';
  section: 'okuma' | 'izleme' | 'eslik';
  position: number;
  kind: string;
  heading: string | null;
  title_original: string | null;
  author: string | null;
  publication: string | null;
  form_label: string | null;
  language: string | null;
  published_year: number | null;
  duration_note: string | null;
  url: string | null;
  link_label: string | null;
  link_hint: string | null;
  access_note: string | null;
  spoiler_level: 'yok' | 'hafif' | 'var' | 'belirtilmedi';
  note: string | null;
  prompt: string | null;
  quote: string | null;
  quote_credit: string | null;
  rights_status: 'baglanti' | 'ozgun_ozet' | 'lisansli_ceviri' | 'kendi_icerigi';
  rights_note: string | null;
  status: 'taslak' | 'yayinda';
  link_status: 'denetlenmedi' | 'saglam' | 'yonlendirme' | 'kirik' | 'hata';
  link_checked_at: Date | null;
  link_http_status: number | null;
  updated_at: Date;
}

export interface QuestionRow {
  id: string;
  film_id: string;
  layer: 'once' | 'sonra';
  body: string;
  position: number;
  status: 'taslak' | 'yayinda';
}

export interface NoteRow {
  id: string;
  title: string;
  body: string;
  author_credit: string | null;
  status: 'taslak' | 'yayinda';
  published_at: Date | null;
}

export interface FilmListItem extends FilmRow {
  reading_count: number;
  after_visible: boolean;
}

/** Club order: manual sort key first, then programme number. */
export async function listFilms(v: Viewer): Promise<FilmListItem[]> {
  return asMember(actorOf(v), async (tx) => {
    const rows = await tx<FilmListItem[]>`
      select f.*,
             (select count(*)::int from resources r where r.film_id = f.id and r.layer = 'once'
                and r.status = 'yayinda') as reading_count,
             (f.after_published_at is not null and f.after_published_at <= now()) as after_visible
        from films f
       order by coalesce(f.sort_key, f.program_no, 9999), f.program_no nulls last, f.created_at`;
    return rows;
  });
}

export interface FilmDetail {
  film: FilmRow;
  before: ResourceRow[];
  after: ResourceRow[];
  questions: QuestionRow[];
  notes: NoteRow[];
  afterVisible: boolean;
  events: { number: number | null; starts_at: Date; status: string }[];
}

/**
 * Everything a member may see about one film. The after layer arrives only
 * if Postgres agrees it is published (resources/questions/notes policies);
 * `afterVisible` is informational, not the gate.
 */
export async function getFilm(
  v: Viewer,
  slug: string,
  opts: { asMemberPreview?: boolean } = {},
): Promise<FilmDetail | null> {
  return asMember(actorOf(v), async (tx) => {
    const [film] = await tx<FilmRow[]>`select * from films where slug = ${slug}`;
    if (!film) return null;
    const published = (s: string) => !opts.asMemberPreview || s === 'yayinda';
    const resources = (
      await tx<ResourceRow[]>`
      select * from resources where film_id = ${film.id}
       order by layer, case section when 'okuma' then 0 when 'izleme' then 1 else 2 end, position, created_at`
    ).filter((r) => published(r.status));
    const questions = (
      await tx<QuestionRow[]>`
      select * from questions where film_id = ${film.id} order by layer, position, created_at`
    ).filter((q) => published(q.status));
    const notes = (
      await tx<NoteRow[]>`
      select id, title, body, author_credit, status, published_at from screening_notes
       where film_id = ${film.id} order by coalesce(published_at, created_at)`
    ).filter((n) => published(n.status));
    const events = await tx<{ number: number | null; starts_at: Date; status: string }[]>`
      select e.number, e.starts_at, e.status from events e
        join event_films ef on ef.event_id = e.id
       where ef.film_id = ${film.id} and e.status <> 'taslak'
       order by e.starts_at`;
    const afterVisible =
      !!film.after_published_at && film.after_published_at.getTime() <= Date.now();
    const showAfter = afterVisible || (v.isStaff && !opts.asMemberPreview);
    return {
      film,
      before: resources.filter((r) => r.layer === 'once'),
      after: showAfter ? resources.filter((r) => r.layer === 'sonra') : [],
      questions: questions.filter((q) => q.layer === 'once' || showAfter),
      notes: showAfter ? notes : [],
      afterVisible,
      events,
    };
  });
}

export interface ResourceMark {
  resource_id: string;
  read_at: Date | null;
  saved_at: Date | null;
}

export async function getMarks(v: Viewer, filmId: string): Promise<Map<string, ResourceMark>> {
  const rows = await asMember(
    actorOf(v),
    (tx) => tx<ResourceMark[]>`
      select m.resource_id, m.read_at, m.saved_at from resource_marks m
        join resources r on r.id = m.resource_id
       where r.film_id = ${filmId}`,
  );
  return new Map(rows.map((r) => [r.resource_id, r]));
}

export async function setMark(
  v: Viewer,
  resourceId: string,
  field: 'read' | 'saved',
  on: boolean,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    const visible = await tx`select 1 from resources where id = ${resourceId}`;
    if (!visible.length) throw new Error('not found');
    const value = on ? new Date() : null;
    if (field === 'read') {
      await tx`insert into resource_marks (member_id, resource_id, read_at) values (${v.id}, ${resourceId}, ${value})
               on conflict (member_id, resource_id) do update set read_at = excluded.read_at, updated_at = now()`;
    } else {
      await tx`insert into resource_marks (member_id, resource_id, saved_at) values (${v.id}, ${resourceId}, ${value})
               on conflict (member_id, resource_id) do update set saved_at = excluded.saved_at, updated_at = now()`;
    }
  });
}

export interface SavedItem {
  resource_id: string;
  heading: string | null;
  title_original: string | null;
  publication: string | null;
  url: string | null;
  film_slug: string;
  film_title: string;
  program_no: number | null;
  read_at: Date | null;
  saved_at: Date | null;
}

export async function listSaved(v: Viewer): Promise<SavedItem[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<SavedItem[]>`
      select m.resource_id, r.heading, r.title_original, r.publication, r.url,
             f.slug as film_slug, f.title as film_title, f.program_no, m.read_at, m.saved_at
        from resource_marks m
        join resources r on r.id = m.resource_id
        join films f on f.id = r.film_id
       where m.member_id = ${v.id} and (m.saved_at is not null)
       order by m.saved_at desc`,
  );
}

/** Most recently published source across visible films, for the room. */
export async function latestPublishedResource(v: Viewer) {
  const [row] = await asMember(
    actorOf(v),
    (tx) => tx<
      (ResourceRow & { film_slug: string; film_title: string; program_no: number | null })[]
    >`
      select r.*, f.slug as film_slug, f.title as film_title, f.program_no
        from resources r join films f on f.id = r.film_id
       where r.status = 'yayinda'
       order by r.published_at desc nulls last, f.program_no desc nulls last, r.position
       limit 1`,
  );
  return row ?? null;
}
