import 'server-only';
import { asMember } from '@/server/db/context';
import { actorOf, type Viewer } from '@/server/auth/viewer';

export async function updateOwnProfile(v: Viewer, displayName: string, email: string | null): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`select app.update_own_profile(${displayName}, ${email ?? ''})`;
    await tx`select app.audit('profile.update', 'member', ${v.id}, '{}'::jsonb)`;
  });
}

export async function acknowledgePrivacy(v: Viewer): Promise<void> {
  await asMember(actorOf(v), async (tx) => {
    await tx`select app.ack_privacy()`;
  });
}

/** Everything the club stores about the viewer, as they may read it (KVKK access). */
export async function exportOwnData(v: Viewer) {
  return asMember(actorOf(v), async (tx) => {
    const [member] = await tx`
      select id, display_name, email, role, status, created_at, activated_at, privacy_ack_at from members where id = ${v.id}`;
    const invitations = await tx`
      select e.number, e.starts_at, i.status, i.rsvp, i.rsvp_note, i.rsvp_at, i.invited_at
        from event_invitees i join events e on e.id = i.event_id where i.member_id = ${v.id}`;
    const journal = await tx`
      select id, film_id, kind, body, visibility, attribution, shared_at, created_at, updated_at
        from journal_entries where member_id = ${v.id} order by created_at`;
    const contributions = await tx`
      select id, film_id, question_id, parent_id, body, attribution, status, created_at
        from contributions where member_id = ${v.id} order by created_at`;
    const marks = await tx`select resource_id, read_at, saved_at from resource_marks where member_id = ${v.id}`;
    return {
      exported_at: new Date().toISOString(),
      note: 'bağlık.society üzerinde senin hakkında tutulan kayıtlar. oturum ve giriş kodu kayıtları güvenlik nedeniyle özet olarak profil sayfasında görünür.',
      member,
      invitations,
      journal,
      contributions,
      reading_marks: marks,
    };
  });
}
