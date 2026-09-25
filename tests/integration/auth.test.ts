import { afterAll, describe, expect, it } from 'vitest';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import {
  enterWithCode,
  issueInvite,
  requestRecovery,
  revokeMember,
  rotatePersonalKey,
} from '@/server/auth/door';
import { resolveSession } from '@/server/auth/sessions-db';
import { beginEnrollment, verifyMfa } from '@/server/auth/mfa';
import { base32Decode, currentStep, hotp } from '@/lib/totp';
import { makeMember } from '../support/fixtures';

afterAll(closeDb);

let ipCounter = 0;
const ctx = () => ({ ip: `203.0.113.${++ipCounter}`, userAgent: 'Mozilla/5.0 (iPhone) Safari/605' });

describe('the door', () => {
  it('an invite code works exactly once, activates the member and opens a session', async () => {
    const m = await makeMember('member', { status: 'invited' });
    const code = await issueInvite(m.id, null);
    const first = await enterWithCode(code, ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.kind).toBe('invite');
    expect((await resolveSession(first.token))?.member_id).toBe(m.id);
    const [row] = await asSystem((tx) => tx`select status from members where id = ${m.id}`);
    expect(row?.status).toBe('active');
    expect(await enterWithCode(code, ctx())).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts the personal key in any typed form; rotation kills the old key', async () => {
    const m = await makeMember('member');
    const key = await rotatePersonalKey(m.id);
    expect((await enterWithCode(key.toLowerCase().replace(/-/g, ' '), ctx())).ok).toBe(true);
    const next = await rotatePersonalKey(m.id);
    expect((await enterWithCode(key, ctx())).ok).toBe(false);
    expect((await enterWithCode(next, ctx())).ok).toBe(true);
  });

  it('gives the same answer for unknown, wrong, expired and revoked', async () => {
    const m = await makeMember('member');
    const key = await rotatePersonalKey(m.id);
    const wrong = key.slice(0, 5) + (key[5] === 'A' ? 'B' : 'A') + key.slice(6);
    const expiredMember = await makeMember('member', { status: 'invited' });
    const expired = await issueInvite(expiredMember.id, null);
    await asSystem((tx) => tx`update private.credentials set expires_at = now() - interval '1 second' where member_id = ${expiredMember.id}`);
    const revokedMember = await makeMember('member');
    const revokedKey = await rotatePersonalKey(revokedMember.id);
    const owner = await makeMember('owner');
    await revokeMember(revokedMember.id, owner.id);
    for (const attempt of ['ZZZZ-ZZZZ-ZZZZ-ZZZZ', wrong, expired, revokedKey, 'not a code']) {
      expect(await enterWithCode(attempt, ctx())).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('revoking a member ends their sessions', async () => {
    const m = await makeMember('member');
    const key = await rotatePersonalKey(m.id);
    const r = await enterWithCode(key, ctx());
    if (!r.ok) throw new Error('login failed');
    const owner = await makeMember('owner');
    await revokeMember(m.id, owner.id);
    expect(await resolveSession(r.token)).toBeNull();
  });

  it('throttles repeated failures from one address', async () => {
    const ip = { ip: '198.51.100.77', userAgent: null };
    for (let i = 0; i < 10; i++) await enterWithCode('ZZZZ-ZZZZ-ZZZZ-ZZZ' + (i % 10), ip);
    expect(await enterWithCode('ZZZZ-ZZZZ-ZZZZ-ZZZZ', ip)).toEqual({ ok: false, reason: 'throttled' });
  });

  it('locks a selector after repeated wrong verifiers, even from many addresses', async () => {
    const m = await makeMember('member');
    const key = await rotatePersonalKey(m.id);
    for (let i = 0; i < 8; i++) await enterWithCode(key.slice(0, 5) + 'ZZZZ-ZZZZ-ZZZ' + i, ctx());
    // the right key is now refused too (same generic answer)
    expect(await enterWithCode(key, ctx())).toEqual({ ok: false, reason: 'invalid' });
    await asSystem((tx) => tx`delete from private.auth_attempts where bucket = ${'sel:' + key.slice(0, 4)}`);
    expect((await enterWithCode(key, ctx())).ok).toBe(true);
  });

  it('stores codes only as Argon2id hashes', async () => {
    const m = await makeMember('member');
    const key = await rotatePersonalKey(m.id);
    const [row] = await asSystem((tx) => tx<{ selector: string; verifier_hash: string }[]>`
      select selector, verifier_hash from private.credentials where member_id = ${m.id} and revoked_at is null`);
    expect(row!.verifier_hash).toMatch(/^\$argon2id\$/);
    expect(row!.verifier_hash).not.toContain(key.replace(/-/g, '').slice(4));
  });
});

describe('recovery', () => {
  it('issues a 30-minute one-time code only for active members; unknown addresses look identical', async () => {
    const m = await makeMember('member', { email: `kurtarma-${Date.now()}@example.test` });
    const none = await requestRecovery('yok-boyle-biri@example.test', '192.0.2.10');
    expect(none.kind).toBe('none');
    const issued = await requestRecovery(m.email!.toUpperCase(), '192.0.2.11');
    expect(issued.kind).toBe('issued');
    if (issued.kind !== 'issued') return;
    const r = await enterWithCode(issued.code, ctx());
    expect(r.ok && r.kind).toBe('recovery');
    expect((await enterWithCode(issued.code, ctx())).ok).toBe(false);
  });
});

describe('admin second factor', () => {
  it('enrols, verifies and refuses replays', async () => {
    const admin = await makeMember('admin');
    const [s] = await asSystem((tx) => tx<{ id: string }[]>`
      insert into private.sessions (member_id, token_hash, idle_expires_at, expires_at)
      values (${admin.id}, ${Buffer.from(admin.id)}, now() + interval '1 day', now() + interval '1 day') returning id`);
    const { secret } = await beginEnrollment(admin.id, admin.email!);
    const code = hotp(base32Decode(secret), currentStep());
    expect(await verifyMfa(admin.id, s!.id, '000000' === code ? '111111' : '000000')).toBe('invalid');
    expect(await verifyMfa(admin.id, s!.id, code)).toBe('ok');
    expect(await verifyMfa(admin.id, s!.id, code)).toBe('invalid'); // replay
    const [row] = await asSystem((tx) => tx`select mfa_verified_at from private.sessions where id = ${s!.id}`);
    expect(row?.mfa_verified_at).toBeInstanceOf(Date);
  });
});
