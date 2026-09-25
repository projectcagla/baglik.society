import { asSystem } from '@/server/db/system';
import type { Viewer, Role } from '@/server/auth/viewer';

let n = 0;

export async function makeMember(role: Role = 'member', opts: { email?: string | null; status?: string } = {}) {
  n += 1;
  const name = `test ${role} ${n} ${Math.random().toString(36).slice(2, 6)}`;
  const email = opts.email === undefined ? `${name.replace(/\s/g, '.')}@example.test` : opts.email;
  const [m] = await asSystem(
    (tx) => tx<{ id: string }[]>`
      insert into members (display_name, email, role, status, activated_at)
      values (${name}, ${email}, ${role}, ${opts.status ?? 'active'}, now()) returning id`,
  );
  return { id: m!.id, name, email };
}

export function viewerFor(m: { id: string; name: string; email: string | null }, role: Role, mfa = false): Viewer {
  const isAdmin = role === 'owner' || role === 'admin';
  return {
    id: m.id,
    sessionId: '00000000-0000-0000-0000-000000000000',
    displayName: m.name,
    email: m.email,
    role,
    isStaff: isAdmin || role === 'editor',
    isAdmin,
    mfaFresh: isAdmin && mfa,
    privacyAcknowledged: true,
  };
}

export async function eventTwo() {
  const [e] = await asSystem((tx) => tx<{ id: string }[]>`select id from events where number = 2`);
  return e!.id;
}

export async function film(slug: string) {
  const [f] = await asSystem((tx) => tx<{ id: string }[]>`select id from films where slug = ${slug}`);
  return f!.id;
}

export async function invite(eventId: string, memberId: string) {
  await asSystem((tx) => tx`insert into event_invitees (event_id, member_id) values (${eventId}, ${memberId}) on conflict do nothing`);
}

export async function setPrivate(eventId: string, patch: { location_text?: string | null; release_at?: Date | null; released_at?: Date | null; release_audience?: string }) {
  await asSystem(async (tx) => {
    if ('location_text' in patch) await tx`update event_private set location_text = ${patch.location_text ?? null} where event_id = ${eventId}`;
    if ('release_at' in patch) await tx`update event_private set release_at = ${patch.release_at ?? null} where event_id = ${eventId}`;
    if ('released_at' in patch) await tx`update event_private set released_at = ${patch.released_at ?? null} where event_id = ${eventId}`;
    if (patch.release_audience) await tx`update event_private set release_audience = ${patch.release_audience} where event_id = ${eventId}`;
  });
}

export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000);
