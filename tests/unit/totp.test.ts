import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, verifyTotp } from '@/lib/totp';

// RFC 6238 appendix B (SHA-1), secret "12345678901234567890"
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches RFC 6238 test vectors (last 6 digits)', () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [t, code] of vectors) {
      expect(hotp(base32Decode(SECRET), Math.floor(t / 30))).toBe(code);
      expect(verifyTotp(SECRET, code, { nowMs: t * 1000, window: 0 })).toBe(Math.floor(t / 30));
    }
  });

  it('accepts ±1 step and rejects older codes', () => {
    const t = 1111111111 * 1000;
    const prev = hotp(base32Decode(SECRET), Math.floor(t / 30000) - 1);
    const old = hotp(base32Decode(SECRET), Math.floor(t / 30000) - 3);
    expect(verifyTotp(SECRET, prev, { nowMs: t })).not.toBeNull();
    expect(verifyTotp(SECRET, old, { nowMs: t })).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', { nowMs: t })).toBeNull();
  });

  it('round-trips base32 and builds an otpauth uri', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(otpauthUri(SECRET, 'a@b.c')).toMatch(/^otpauth:\/\/totp\/ba%C4%9Fl%C4%B1k\.society%3Aa%40b\.c\?secret=/);
  });
});
