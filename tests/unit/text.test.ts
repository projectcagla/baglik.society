import { describe, expect, it } from 'vitest';
import { brandLower, filmSlug, monogram, programLabel, slugify } from '@/lib/text';
import { safeReturnPath } from '@/lib/return-path';

describe('brand text', () => {
  it('lowercases Turkish and foreign names correctly', () => {
    expect(brandLower('Hirokazu Kore-eda')).toBe('hirokazu kore-eda');
    expect(brandLower('IŞIK')).toBe('ışık');
    expect(brandLower('İstanbul')).toBe('istanbul');
    expect(brandLower('Irma Vep')).toBe('irma vep');
    expect(brandLower('Ryūsuke Hamaguchi')).toBe('ryūsuke hamaguchi');
  });

  it('builds program labels and slugs', () => {
    expect(programLabel(2, 'Canavar')).toBe('002 / canavar');
    expect(filmSlug(1, 'Drive My Car')).toBe('001-drive-my-car');
    expect(slugify('Çağla’nın Şehrazad’ı')).toBe('caglanin-sehrazadi');
    expect(monogram('çağla aytaç dursun')).toBe('ÇA');
  });
});

describe('safe return path', () => {
  it('allows known member sections only', () => {
    expect(safeReturnPath('/filmler/002-canavar')).toBe('/filmler/002-canavar');
    expect(safeReturnPath('/geceler/2?x=1')).toBe('/geceler/2?x=1');
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil')).toBeNull();
    expect(safeReturnPath('/filmler/../../etc')).toBeNull();
    expect(safeReturnPath('/api/cron/link-check')).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});
