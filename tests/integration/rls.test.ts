import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAnonymous, asMember } from '@/server/db/context';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { getFilm, listFilms } from '@/server/dal/films';
import { getEventByNumber, listEvents, setRsvp } from '@/server/dal/events';
import {
  createEntry,
  listSharedEntries,
  shareEntry,
  listOwnEntries,
  addContribution,
} from '@/server/dal/journal';
import { deskMembers, createMember, saveEventPrivate } from '@/server/dal/desk';
import { eventTwo, film, invite, makeMember, viewerFor } from '../support/fixtures';

afterAll(closeDb);

describe('anonymous (baglik_app without identity)', () => {
  it('reads nothing from any content table', async () => {
    await asAnonymous(async (tx) => {
      for (const table of [
        'films',
        'resources',
        'questions',
        'screening_notes',
        'events',
        'event_films',
        'event_invitees',
        'event_private',
        'members',
        'journal_entries',
        'contributions',
        'audit_logs',
        'notification_deliveries',
      ]) {
        const rows = await tx.unsafe(`select * from ${table}`);
        expect(rows, table).toHaveLength(0);
      }
    });
  });

  it('cannot touch the private schema at all', async () => {
    await expect(asAnonymous((tx) => tx`select * from private.sessions`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnonymous((tx) => tx`select * from private.credentials`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('cannot write', async () => {
    await expect(
      asAnonymous((tx) => tx`insert into films (slug, title) values ('x-film', 'x')`),
    ).rejects.toThrow();
  });

  it('gets "yok" from the location function', async () => {
    const id = await eventTwo();
    const [row] = await asAnonymous(
      (tx) =>
        tx<
          { state: string; location_text: string | null }[]
        >`select * from app.event_location(${id})`,
    );
    expect(row).toMatchObject({ state: 'yok', location_text: null });
  });
});

describe('members, films and the two layers', () => {
  let member: ReturnType<typeof viewerFor>;
  let editor: ReturnType<typeof viewerFor>;

  beforeAll(async () => {
    member = viewerFor(await makeMember('member'), 'member');
    editor = viewerFor(await makeMember('editor'), 'editor');
  });

  it('seed: both real films visible to a member, in club order', async () => {
    const films = await listFilms(member);
    expect(films.map((f) => f.slug)).toEqual(['001-drive-my-car', '002-canavar']);
    const canavar = films.find((f) => f.slug === '002-canavar')!;
    expect(canavar).toMatchObject({
      title: 'canavar',
      title_original: 'Monster',
      director: 'Hirokazu Kore-eda',
      year: 2023,
      status: 'yaklasiyor',
    });
  });

  it('canavar pre-reading: articles, interviews and listening — no film recommendations, no books', async () => {
    const detail = await getFilm(member, '002-canavar');
    const kinds = detail!.before.map((r) => r.kind);
    expect(kinds).not.toContain('film');
    expect(kinds).not.toContain('book');
    expect(detail!.before.filter((r) => r.section === 'okuma')).toHaveLength(4);
    expect(detail!.before.map((r) => r.url)).toContain(
      'https://www.bfi.org.uk/features/where-begin-hirokazu-koreeda',
    );
    const album = detail!.before.find((r) => r.kind === 'music')!;
    expect(album.note).toContain('Film müziğinden ayrı');
    expect(album.note?.toLowerCase()).not.toContain('soundtrack');
  });

  it('draft films are invisible to members, visible to editors', async () => {
    await asMember(
      { memberId: editor.id, mfa: false },
      (tx) => tx`insert into films (slug, title) values ('999-taslak', 'taslak film')`,
    );
    expect((await listFilms(member)).map((f) => f.slug)).not.toContain('999-taslak');
    expect((await listFilms(editor)).map((f) => f.slug)).toContain('999-taslak');
    expect(await getFilm(member, '999-taslak')).toBeNull();
  });

  it('the after layer is withheld by the database until published', async () => {
    const filmId = await film('002-canavar');
    await asMember({ memberId: editor.id, mfa: false }, async (tx) => {
      await tx`insert into resources (film_id, layer, kind, heading, note, status) values (${filmId}, 'sonra', 'essay', 'SPOILER-BASLIK', 'SPOILER-METIN', 'yayinda')`;
      await tx`insert into screening_notes (film_id, title, body, status) values (${filmId}, 'NOT-BASLIK', 'NOT-METIN', 'yayinda')`;
      await tx`insert into questions (film_id, layer, body, status) values (${filmId}, 'sonra', 'SONRA-SORU', 'yayinda')`;
    });
    // direct SQL as the member: nothing
    const raw = await asMember({ memberId: member.id, mfa: false }, async (tx) => [
      ...(await tx`select * from resources where layer = 'sonra' and film_id = ${filmId}`),
      ...(await tx`select * from screening_notes where film_id = ${filmId}`),
      ...(await tx`select * from questions where layer = 'sonra' and film_id = ${filmId}`),
    ]);
    expect(raw).toHaveLength(0);
    const detail = await getFilm(member, '002-canavar');
    expect(JSON.stringify(detail)).not.toMatch(/SPOILER|NOT-METIN|SONRA-SORU/);
    // contributions are refused too
    await expect(
      addContribution(member, {
        filmId,
        questionId: null,
        parentId: null,
        body: 'x',
        attribution: 'isimli',
      }),
    ).rejects.toThrow();

    await asSystem((tx) => tx`update films set after_published_at = now() where id = ${filmId}`);
    const after = await getFilm(member, '002-canavar');
    expect(after!.after.map((r) => r.heading)).toContain('SPOILER-BASLIK');
    expect(after!.notes.map((n) => n.body)).toContain('NOT-METIN');
    await asSystem((tx) => tx`update films set after_published_at = null where id = ${filmId}`);
  });
});

describe('events and invitations', () => {
  it('only invited members see the night', async () => {
    const eventId = await eventTwo();
    const invited = viewerFor(await makeMember('member'), 'member');
    const outsider = viewerFor(await makeMember('member'), 'member');
    await invite(eventId, invited.id);
    expect((await getEventByNumber(invited, 2))?.event.starts_at.toISOString()).toBe(
      '2026-09-27T16:30:00.000Z',
    );
    expect(await getEventByNumber(outsider, 2)).toBeNull();
    expect(await listEvents(outsider)).toHaveLength(0);
  });

  it('members cannot write RSVPs directly, only through app.set_rsvp', async () => {
    const eventId = await eventTwo();
    const m = viewerFor(await makeMember('member'), 'member');
    await invite(eventId, m.id);
    const updated = await asMember(
      { memberId: m.id, mfa: false },
      (tx) =>
        tx`update event_invitees set rsvp = 'geliyorum', status = 'davetli' where member_id = ${m.id} returning 1`,
    );
    expect(updated).toHaveLength(0);
    await setRsvp(m, eventId, 'geliyorum', 'biraz geç kalabilirim');
    expect((await getEventByNumber(m, 2))?.invite).toMatchObject({
      rsvp: 'geliyorum',
      rsvp_note: 'biraz geç kalabilirim',
    });
  });

  it('refuses RSVP after the deadline and for non-invitees', async () => {
    const eventId = await eventTwo();
    const m = viewerFor(await makeMember('member'), 'member');
    await expect(setRsvp(m, eventId, 'geliyorum', null)).rejects.toThrow(/not invited/);
    await invite(eventId, m.id);
    await asSystem(
      (tx) =>
        tx`update events set rsvp_deadline = now() - interval '1 minute' where id = ${eventId}`,
    );
    await expect(setRsvp(m, eventId, 'geliyorum', null)).rejects.toThrow(/deadline/);
    await asSystem((tx) => tx`update events set rsvp_deadline = null where id = ${eventId}`);
  });

  it('invitee lists are not visible to other members', async () => {
    const eventId = await eventTwo();
    const a = viewerFor(await makeMember('member'), 'member');
    await invite(eventId, a.id);
    const rows = await asMember(
      { memberId: a.id, mfa: false },
      (tx) => tx`select member_id from event_invitees where event_id = ${eventId}`,
    );
    expect(rows.map((r) => r.member_id)).toEqual([a.id]);
    const guests = await asMember(
      { memberId: a.id, mfa: false },
      (tx) => tx`select * from app.event_guest_list(${eventId})`,
    );
    expect(guests).toHaveLength(0); // guest list disabled by default
  });
});

describe('journal privacy', () => {
  it('private notes stay with their owner — even admins with MFA cannot read them', async () => {
    const a = viewerFor(await makeMember('member'), 'member');
    const b = viewerFor(await makeMember('member'), 'member');
    const admin = viewerFor(await makeMember('admin'), 'admin', true);
    await createEntry(a, { filmId: null, kind: 'beklenti', body: 'GIZLI-NOT' });
    expect((await listOwnEntries(a)).map((e) => e.body)).toContain('GIZLI-NOT');
    for (const v of [b, admin]) {
      const rows = await asMember(
        { memberId: v.id, mfa: v.mfaFresh },
        (tx) => tx`select body from journal_entries where body = 'GIZLI-NOT'`,
      );
      expect(rows).toHaveLength(0);
    }
    const own = await listOwnEntries(a);
    await shareEntry(a, own[0]!.id, 'anonim');
    const shared = await listSharedEntries(b);
    const entry = shared.find((e) => e.body === 'GIZLI-NOT');
    expect(entry?.attribution_name).toBeNull();
    // b cannot edit a's note
    const edited = await asMember(
      { memberId: b.id, mfa: false },
      (tx) => tx`update journal_entries set body = 'x' where body = 'GIZLI-NOT' returning 1`,
    );
    expect(edited).toHaveLength(0);
  });
});

describe('roles and the member directory', () => {
  it('members see only themselves; admins need MFA to see everyone', async () => {
    const m = viewerFor(await makeMember('member'), 'member');
    const rows = await asMember(
      { memberId: m.id, mfa: false },
      (tx) => tx<{ id: string }[]>`select id from members`,
    );
    expect(rows.map((r) => r.id)).toEqual([m.id]);
    const adminRow = await makeMember('admin');
    await expect(deskMembers(viewerFor(adminRow, 'admin', false))).resolves.toHaveLength(1);
    expect((await deskMembers(viewerFor(adminRow, 'admin', true))).length).toBeGreaterThan(3);
  });

  it('editors cannot create members or read locations', async () => {
    const editor = viewerFor(await makeMember('editor'), 'editor');
    await expect(
      createMember(editor, { display_name: 'x', email: null, role: 'member' }),
    ).rejects.toThrow();
    const rows = await asMember(
      { memberId: editor.id, mfa: false },
      (tx) => tx`select * from event_private`,
    );
    expect(rows).toHaveLength(0);
    await expect(
      saveEventPrivate(editor, await eventTwo(), {
        location_text: 'x',
        location_url: null,
        location_directions: null,
        release_at: null,
        release_audience: 'katilanlar',
        include_in_email: false,
        admin_note: null,
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it('only an owner can create admins', async () => {
    const admin = viewerFor(await makeMember('admin'), 'admin', true);
    const owner = viewerFor(await makeMember('owner'), 'owner', true);
    await expect(
      createMember(admin, { display_name: 'yeni yönetici', email: null, role: 'admin' }),
    ).rejects.toThrow(/only an owner/);
    await expect(
      createMember(owner, { display_name: 'yeni yönetici', email: null, role: 'admin' }),
    ).resolves.toBeTruthy();
  });

  it('a revoked member loses database access immediately', async () => {
    const m = await makeMember('member');
    await asSystem((tx) => tx`update members set status = 'revoked' where id = ${m.id}`);
    expect(await listFilms(viewerFor(m, 'member'))).toHaveLength(0);
  });
});
