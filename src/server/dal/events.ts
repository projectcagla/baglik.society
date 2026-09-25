import 'server-only';
import { asMember } from '@/server/db/context';
import { actorOf, type Viewer } from '@/server/auth/viewer';

export type LocationState = 'yok' | 'iptal' | 'gizli' | 'katilim_gerekli' | 'paylasilmadi' | 'acik';

export interface LocationView {
  state: LocationState;
  location_text: string | null;
  location_url: string | null;
  location_directions: string | null;
  released_from: Date | null;
}

export interface EventRow {
  id: string;
  number: number | null;
  title: string | null;
  starts_at: Date;
  ends_at: Date | null;
  status: 'taslak' | 'davet' | 'ertelendi' | 'iptal' | 'tamamlandi';
  status_note: string | null;
  rsvp_deadline: Date | null;
  capacity: number | null;
  location_public_note: string;
  guest_list_visible: boolean;
  ics_sequence: number;
  updated_at: Date;
}

export interface EventFilm {
  id: string;
  slug: string;
  title: string;
  title_original: string | null;
  director: string | null;
  year: number | null;
  program_no: number | null;
}

export interface MyInvite {
  status: 'davetli' | 'iptal';
  rsvp: 'geliyorum' | 'gelemiyorum' | 'belirsiz' | null;
  rsvp_note: string | null;
  rsvp_at: Date | null;
}

export interface EventView {
  event: EventRow;
  films: EventFilm[];
  invite: MyInvite | null;
  location: LocationView;
  guests: string[] | null;
}

const NO_LOCATION: LocationView = {
  state: 'yok',
  location_text: null,
  location_url: null,
  location_directions: null,
  released_from: null,
};

async function hydrate(
  tx: Parameters<Parameters<typeof asMember>[1]>[0],
  v: Viewer,
  event: EventRow,
): Promise<EventView> {
  const films = await tx<EventFilm[]>`
    select f.id, f.slug, f.title, f.title_original, f.director, f.year, f.program_no
      from event_films ef join films f on f.id = ef.film_id
     where ef.event_id = ${event.id} order by ef.position`;
  const [invite] = await tx<MyInvite[]>`
    select status, rsvp, rsvp_note, rsvp_at from event_invitees
     where event_id = ${event.id} and member_id = ${v.id}`;
  // The only way a member reads a location: the database decides.
  const [location] = await tx<LocationView[]>`select * from app.event_location(${event.id})`;
  const guests = event.guest_list_visible
    ? (
        await tx<
          { display_name: string }[]
        >`select display_name from app.event_guest_list(${event.id})`
      ).map((g) => g.display_name)
    : null;
  return { event, films, invite: invite ?? null, location: location ?? NO_LOCATION, guests };
}

/** The next night the viewer is invited to (still upcoming or started < 6 h ago). */
export async function nextEvent(v: Viewer): Promise<EventView | null> {
  return asMember(actorOf(v), async (tx) => {
    const [event] = await tx<EventRow[]>`
      select e.* from events e
        join event_invitees i on i.event_id = e.id and i.member_id = ${v.id} and i.status = 'davetli'
       where e.status in ('davet', 'ertelendi', 'iptal')
         and e.starts_at > now() - interval '6 hours'
       order by e.starts_at
       limit 1`;
    return event ? hydrate(tx, v, event) : null;
  });
}

export interface EventListItem extends EventRow {
  film_title: string | null;
  film_slug: string | null;
  program_no: number | null;
  rsvp: MyInvite['rsvp'];
}

/** Events visible to the viewer (RLS: invited, or staff). */
export async function listEvents(v: Viewer): Promise<EventListItem[]> {
  return asMember(
    actorOf(v),
    (tx) => tx<EventListItem[]>`
      select e.*, f.title as film_title, f.slug as film_slug, f.program_no,
             (select rsvp from event_invitees i where i.event_id = e.id and i.member_id = ${v.id}) as rsvp
        from events e
        left join lateral (
          select f.* from event_films ef join films f on f.id = ef.film_id
           where ef.event_id = e.id order by ef.position limit 1) f on true
       where e.status <> 'taslak'
       order by e.starts_at desc`,
  );
}

export async function getEventByNumber(v: Viewer, number: number): Promise<EventView | null> {
  return asMember(actorOf(v), async (tx) => {
    const [event] = await tx<
      EventRow[]
    >`select * from events where number = ${number} and status <> 'taslak'`;
    return event ? hydrate(tx, v, event) : null;
  });
}

export type RsvpValue = 'geliyorum' | 'gelemiyorum' | 'belirsiz';

export async function setRsvp(
  v: Viewer,
  eventId: string,
  rsvp: RsvpValue,
  note: string | null,
): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`select app.set_rsvp(${eventId}, ${rsvp}, ${note})`;
  });
}
