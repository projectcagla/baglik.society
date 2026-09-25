import { afterAll, describe, expect, it } from 'vitest';
import { asMember } from '@/server/db/context';
import { closeDb } from '@/server/db/client';
import { isMfaFresh } from '@/server/auth/sessions-db';
import { moderateJournal } from '@/server/dal/desk';
import { eventTwo, makeMember, viewerFor } from '../support/fixtures';

afterAll(closeDb);

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

describe('the second factor expires', () => {
  it('is fresh for 12 hours, then not', () => {
    expect(isMfaFresh(hoursAgo(1))).toBe(true);
    expect(isMfaFresh(hoursAgo(11.9))).toBe(true);
    expect(isMfaFresh(hoursAgo(12.1))).toBe(false);
    expect(isMfaFresh(null)).toBe(false);
  });

  it('an admin whose factor expired is an admin without the MFA rights, in the database too', async () => {
    const m = await makeMember('admin');
    const expired = viewerFor(m, 'admin', isMfaFresh(hoursAgo(13)));
    expect(expired.mfaFresh).toBe(false);
    const eventId = await eventTwo();
    const rows = await asMember(
      { memberId: expired.id, mfa: expired.mfaFresh },
      (tx) => tx`select * from event_private where event_id = ${eventId}`,
    );
    expect(rows).toHaveLength(0);
    await expect(
      moderateJournal(expired, '00000000-0000-0000-0000-000000000000', 'gizlendi'),
    ).rejects.toThrow(/not allowed/);
    // an editor never gets them, fresh or not
    const editor = viewerFor(await makeMember('editor'), 'editor', true);
    expect(editor.mfaFresh).toBe(false);
  });
});
