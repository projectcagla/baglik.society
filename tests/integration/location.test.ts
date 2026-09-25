import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { asMember } from '@/server/db/context';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { getEventByNumber, nextEvent, setRsvp } from '@/server/dal/events';
import { auditLog, saveEventPrivate } from '@/server/dal/desk';
import {
  eventTwo,
  hoursFromNow,
  invite,
  makeMember,
  setPrivate,
  viewerFor,
} from '../support/fixtures';

// The one secret this app keeps: where film night 002 happens.
const SECRET = 'GIZLI-ADRES Moda Caddesi 123';

afterAll(closeDb);

describe('location release', () => {
  let eventId: string;
  let invited: ReturnType<typeof viewerFor>;
  let outsider: ReturnType<typeof viewerFor>;
  let editor: ReturnType<typeof viewerFor>;
  let adminNoMfa: ReturnType<typeof viewerFor>;
  let admin: ReturnType<typeof viewerFor>;

  beforeAll(async () => {
    eventId = await eventTwo();
    invited = viewerFor(await makeMember('member'), 'member');
    outsider = viewerFor(await makeMember('member'), 'member');
    editor = viewerFor(await makeMember('editor'), 'editor');
    const a = await makeMember('admin');
    adminNoMfa = viewerFor(a, 'admin', false);
    admin = viewerFor(a, 'admin', true);
    await invite(eventId, invited.id);
    await invite(eventId, editor.id);
  });

  afterEach(async () => {
    await setPrivate(eventId, {
      location_text: null,
      release_at: null,
      released_at: null,
      release_audience: 'katilanlar',
    });
    await asSystem((tx) => tx`update event_invitees set rsvp = null where event_id = ${eventId}`);
  });

  it('starts empty: the seed has no location and shows the exact public note', async () => {
    const [p] = await asSystem(
      (tx) =>
        tx`select location_text, release_at, released_at from event_private where event_id = ${eventId}`,
    );
    expect(p).toMatchObject({ location_text: null, release_at: null, released_at: null });
    const view = await getEventByNumber(invited, 2);
    expect(view?.location.state).toBe('gizli');
    expect(view?.event.location_public_note).toBe('konum etkinlik günü davetlilere iletilecektir');
  });

  it('before release: no payload anywhere contains the location', async () => {
    await setPrivate(eventId, { location_text: SECRET, release_at: hoursFromNow(12) });
    await setRsvp(invited, eventId, 'geliyorum', null);
    for (const v of [invited, editor, adminNoMfa, outsider]) {
      const everything = JSON.stringify([await getEventByNumber(v, 2), await nextEvent(v)]);
      expect(everything, v.role).not.toContain('GIZLI-ADRES');
      const direct = await asMember(
        { memberId: v.id, mfa: v.mfaFresh },
        (tx) => tx`select * from event_private`,
      );
      expect(direct, v.role).toHaveLength(0);
    }
    // only the admin with a fresh second factor can read the table itself
    const adminRows = await asMember(
      { memberId: admin.id, mfa: true },
      (tx) =>
        tx<
          { location_text: string }[]
        >`select location_text from event_private where event_id = ${eventId}`,
    );
    expect(adminRows[0]?.location_text).toBe(SECRET);
  });

  it('after release: attendees see it, invitees who have not said yes do not', async () => {
    await setPrivate(eventId, { location_text: SECRET, release_at: hoursFromNow(-1) });
    expect((await getEventByNumber(invited, 2))?.location).toMatchObject({
      state: 'katilim_gerekli',
      location_text: null,
    });
    await setRsvp(invited, eventId, 'geliyorum', null);
    expect((await getEventByNumber(invited, 2))?.location).toMatchObject({
      state: 'acik',
      location_text: SECRET,
    });
    // not invited: nothing, not even the event
    expect(await getEventByNumber(outsider, 2)).toBeNull();
    const [row] = await asMember(
      { memberId: outsider.id, mfa: false },
      (tx) =>
        tx<
          { state: string; location_text: string | null }[]
        >`select * from app.event_location(${eventId})`,
    );
    expect(row).toMatchObject({ state: 'yok', location_text: null });
  });

  it('audience "davetliler" releases to every invitee', async () => {
    await setPrivate(eventId, {
      location_text: SECRET,
      release_at: hoursFromNow(-1),
      release_audience: 'davetliler',
    });
    expect((await getEventByNumber(invited, 2))?.location.state).toBe('acik');
  });

  it('released without a real address: honest fallback, nothing invented', async () => {
    await setPrivate(eventId, { location_text: null, released_at: new Date() });
    await setRsvp(invited, eventId, 'geliyorum', null);
    expect((await getEventByNumber(invited, 2))?.location).toMatchObject({
      state: 'paylasilmadi',
      location_text: null,
    });
  });

  it('cancelling the event hides a released location', async () => {
    await setPrivate(eventId, {
      location_text: SECRET,
      released_at: new Date(),
      release_audience: 'davetliler',
    });
    await asSystem((tx) => tx`update events set status = 'iptal' where id = ${eventId}`);
    expect((await getEventByNumber(invited, 2))?.location).toMatchObject({
      state: 'iptal',
      location_text: null,
    });
    await asSystem((tx) => tx`update events set status = 'davet' where id = ${eventId}`);
  });

  it('the audit log records the change but never the address', async () => {
    await saveEventPrivate(admin, eventId, {
      location_text: SECRET,
      location_url: null,
      location_directions: null,
      release_at: hoursFromNow(5),
      release_audience: 'katilanlar',
      include_in_email: false,
      admin_note: null,
    });
    const log = await auditLog(admin, 20);
    expect(log.some((l) => l.action === 'location.update')).toBe(true);
    expect(JSON.stringify(log)).not.toContain('GIZLI-ADRES');
  });

  it('an admin without a fresh second factor cannot change the location', async () => {
    await expect(
      saveEventPrivate(adminNoMfa, eventId, {
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
});
