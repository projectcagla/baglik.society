import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { enterWithCode } from '@/server/auth/door';
import { bootstrapOwner, setupAvailable } from '@/server/auth/setup';

const TOKEN = 'kurulum-anahtari-0123456789abcdef-0123456789';
const ctx = (ip: string) => ({ ip, userAgent: 'vitest' });

afterEach(async () => {
  vi.unstubAllEnvs();
  await asSystem(async (tx) => {
    await tx`delete from members where display_name like 'kurulum %'`;
    await tx`delete from private.auth_attempts where bucket like 'setup:%'`;
  });
});
afterAll(closeDb);

describe('first-owner setup from the browser', () => {
  it('is closed without a token (or with a short one)', async () => {
    expect(await setupAvailable()).toBe(false);
    vi.stubEnv('SETUP_TOKEN', 'kisa');
    expect(await setupAvailable()).toBe(false);
    expect((await bootstrapOwner('kisa', 'kurulum a', '198.51.100.1')).kind).toBe('closed');
  });

  it('creates exactly one owner with a working one-time code; then it is gone', async () => {
    vi.stubEnv('SETUP_TOKEN', TOKEN);
    expect(await setupAvailable()).toBe(true);
    expect(
      (
        await bootstrapOwner(
          'yanlis-anahtar-0123456789abcdef-xyz12345',
          'kurulum x',
          '198.51.100.2',
        )
      ).kind,
    ).toBe('denied');
    // two at once: one owner, the other finds setup closed
    const [a, b] = await Promise.all([
      bootstrapOwner(TOKEN, 'kurulum b', '198.51.100.3'),
      bootstrapOwner(TOKEN, 'kurulum c', '198.51.100.4'),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(['closed', 'ok']);
    const ok = (a.kind === 'ok' ? a : b) as { kind: 'ok'; code: string };
    expect(ok.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    const entered = await enterWithCode(ok.code, ctx('198.51.100.3'));
    expect(entered.ok).toBe(true);
    expect(await setupAvailable()).toBe(false);
    const owners = await asSystem(
      (tx) => tx`select 1 from members where role = 'owner' and display_name like 'kurulum %'`,
    );
    expect(owners).toHaveLength(1);
  });

  it('a guessed token is throttled after five tries', async () => {
    vi.stubEnv('SETUP_TOKEN', TOKEN);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await bootstrapOwner(
            `yanlis-${i}-0123456789abcdef-0123456789`,
            'kurulum y',
            '198.51.100.9',
          )
        ).kind,
      ).toBe('denied');
    expect((await bootstrapOwner(TOKEN, 'kurulum z', '198.51.100.9')).kind).toBe('throttled');
  });
});
