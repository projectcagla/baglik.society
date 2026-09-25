import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/return-path';

describe('return paths (after the door, after MFA, after an action)', () => {
  it('keeps known member sections', () => {
    for (const p of [
      '/oda',
      '/filmler/002-canavar/okuma',
      '/filmler/002-canavar/okuma?gorunum=uye',
      '/geceler/2',
      '/masa/uyeler',
    ]) {
      expect(safeReturnPath(p), p).toBe(p);
    }
  });

  it('refuses everything that could leave the site or climb out of a section', () => {
    for (const p of [
      '//evil.example/oda',
      '/\\evil.example',
      'https://evil.example/oda',
      'javascript:alert(1)',
      '/oda/../../etc/passwd',
      '/api/cron/link-check',
      '/kayip-anahtar',
      '/',
      '/odak',
      '/oda\nSet-Cookie: x=1',
      '/oda#<script>',
      `/oda/${'a'.repeat(400)}`,
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnPath(p as string), String(p)).toBeNull();
    }
  });
});
