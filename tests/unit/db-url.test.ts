import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { driverUrl } from '@/lib/db-url';

describe('driverUrl', () => {
  it('drops libpq-only options a dashboard adds, keeps the rest', () => {
    const neon =
      'postgresql://neondb_owner:p%40ss@ep-x-123.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    const out = driverUrl(neon);
    expect(out).not.toContain('channel_binding');
    expect(out).toContain('sslmode=require');
    const o = postgres(out).options;
    expect(o.host).toEqual(['ep-x-123.eu-central-1.aws.neon.tech']);
    expect(o.database).toBe('neondb');
    expect(o.pass).toBe('p@ss');
    expect(o.connection).not.toHaveProperty('channel_binding');
  });

  it('leaves ordinary and unparsable strings untouched', () => {
    const plain = 'postgres://baglik:x@localhost:5432/baglik';
    expect(driverUrl(plain)).toBe(plain);
    expect(driverUrl('not a url')).toBe('not a url');
  });
});
