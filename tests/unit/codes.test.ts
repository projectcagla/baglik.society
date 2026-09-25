import { describe, expect, it } from 'vitest';
import { ALPHABET, CODE_LEN, formatCode, generateCode, normalizeCode } from '@/lib/codes';

describe('access codes', () => {
  it('generates 16 Crockford symbols with a 4-symbol selector', () => {
    const { code, selector, verifier } = generateCode();
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(selector).toHaveLength(4);
    expect(verifier).toHaveLength(12);
    for (const ch of selector + verifier) expect(ALPHABET).toContain(ch);
  });

  it('does not repeat across many draws', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateCode().code));
    expect(seen.size).toBe(2000);
  });

  it('normalises what people type or paste', () => {
    const expected = { selector: 'AB1C', verifier: 'D0EF23456789' };
    expect(normalizeCode('AB1C-D0EF-2345-6789')).toEqual(expected);
    expect(normalizeCode(' ab1c d0ef 2345 6789 ')).toEqual(expected);
    expect(normalizeCode('abic-doef-2345-6789')).toEqual(expected); // i→1, o→0
    expect(normalizeCode('abıc-doef-2345-6789')).toEqual(expected); // Turkish dotless ı
    expect(normalizeCode('AB1C.D0EF.2345.6789')).toEqual(expected);
  });

  it('rejects impossible input without touching the database', () => {
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode('short')).toBeNull();
    expect(normalizeCode('AB1C-D0EF-2345-678U')).toBeNull(); // U not in alphabet
    expect(normalizeCode('x'.repeat(200))).toBeNull();
    expect(normalizeCode("'; drop table members; --")).toBeNull();
  });

  it('formats in groups of four', () => {
    expect(formatCode('A'.repeat(CODE_LEN))).toBe('AAAA-AAAA-AAAA-AAAA');
  });
});
