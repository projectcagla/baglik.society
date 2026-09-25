import { afterAll, describe, expect, it, vi } from 'vitest';
import { closeDb } from '@/server/db/client';

afterAll(closeDb);

describe('health signal', () => {
  it('says "ok" when the database answers', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('says only "unavailable" when the database is gone — no error text, host or version', async () => {
    vi.resetModules();
    vi.doMock('@/server/db/system', () => ({
      asSystem: () =>
        Promise.reject(new Error('connect ECONNREFUSED 10.0.0.7:5432 password authentication')),
    }));
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: 'unavailable' });
    expect(body).not.toMatch(/ECONN|5432|password|10\.0\.0/);
    vi.doUnmock('@/server/db/system');
  });

  it('gives up on a database that hangs', async () => {
    vi.resetModules();
    vi.doMock('@/server/db/system', () => ({ asSystem: () => new Promise(() => {}) }));
    const { databaseReachable } = await import('@/server/system/health');
    expect(await databaseReachable(50)).toBe(false);
    vi.doUnmock('@/server/db/system');
  });
});
