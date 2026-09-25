import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { setRsvp } from '@/server/dal/events';
import { makeMember, viewerFor } from '../support/fixtures';

const created: string[] = [];

afterAll(async () => {
  // these nights exist only for this file; leave the shared test database as found
  await asSystem((tx) => tx`delete from events where id = any(${created})`);
  await closeDb();
});

async function eventWithCapacity(capacity: number) {
  const [e] = await asSystem(
    (tx) => tx<{ id: string }[]>`
      insert into events (starts_at, status, capacity) values (now() + interval '3 days', 'davet', ${capacity})
      returning id`,
  );
  await asSystem((tx) => tx`insert into event_private (event_id) values (${e!.id})`);
  created.push(e!.id);
  return e!.id;
}

async function invite(eventId: string, memberId: string) {
  await asSystem(
    (tx) => tx`insert into event_invitees (event_id, member_id) values (${eventId}, ${memberId})`,
  );
}

/** A connection that behaves like one member's request inside an open transaction. */
async function memberTx(memberId: string) {
  const c = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await c`begin`;
  await c.unsafe('set local role baglik_app');
  await c`select set_config('app.member_id', ${memberId}, true), set_config('app.mfa', 'off', true)`;
  return c;
}

describe('RSVP under concurrency', () => {
  it('two simultaneous requests for the last seat: exactly one wins', async () => {
    const eventId = await eventWithCapacity(1);
    const a = await makeMember('member');
    const b = await makeMember('member');
    await invite(eventId, a.id);
    await invite(eventId, b.id);

    const t1 = await memberTx(a.id);
    const t2 = await memberTx(b.id);
    try {
      await t1`select app.set_rsvp(${eventId}, 'geliyorum', null)`; // not committed yet
      const second = t2`select app.set_rsvp(${eventId}, 'geliyorum', null)`.then(
        () => 'accepted',
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300)); // t2 is now racing t1
      await t1`commit`;
      expect(await second).toMatch(/capacity reached/);
      await t2`rollback`;
    } finally {
      await t1.end();
      await t2.end();
    }
    const yes = await asSystem(
      (tx) =>
        tx`select member_id from event_invitees where event_id = ${eventId} and rsvp = 'geliyorum'`,
    );
    expect(yes.map((r) => r.member_id)).toEqual([a.id]);
  });

  it('repeating the same answer is idempotent and does not consume a second seat', async () => {
    const eventId = await eventWithCapacity(1);
    const a = await makeMember('member');
    await invite(eventId, a.id);
    const v = viewerFor(a, 'member');
    await setRsvp(v, eventId, 'geliyorum', null);
    await setRsvp(v, eventId, 'geliyorum', null);
    await Promise.all([
      setRsvp(v, eventId, 'geliyorum', null),
      setRsvp(v, eventId, 'geliyorum', null),
    ]);
    const yes = await asSystem(
      (tx) =>
        tx`select count(*)::int as n from event_invitees where event_id = ${eventId} and rsvp = 'geliyorum'`,
    );
    expect(yes[0]?.n).toBe(1);
  });

  it('a freed seat can be taken; a full event refuses politely; the deadline is enforced', async () => {
    const eventId = await eventWithCapacity(1);
    const a = viewerFor(await makeMember('member'), 'member');
    const b = viewerFor(await makeMember('member'), 'member');
    await invite(eventId, a.id);
    await invite(eventId, b.id);
    await setRsvp(a, eventId, 'geliyorum', null);
    await expect(setRsvp(b, eventId, 'geliyorum', null)).rejects.toThrow(/capacity reached/);
    await setRsvp(b, eventId, 'belirsiz', null); // other answers never need a seat
    await setRsvp(a, eventId, 'gelemiyorum', null);
    await setRsvp(b, eventId, 'geliyorum', null);
    await asSystem(
      (tx) =>
        tx`update events set rsvp_deadline = now() - interval '1 minute' where id = ${eventId}`,
    );
    await expect(setRsvp(a, eventId, 'belirsiz', null)).rejects.toThrow(/deadline/);
  });
});
