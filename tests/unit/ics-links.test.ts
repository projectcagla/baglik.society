import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, fold } from '@/lib/ics';
import { classify } from '@/server/system/link-check';

describe('calendar file', () => {
  const base = {
    uid: 'event-x@baglik.society',
    sequence: 0,
    start: new Date('2026-09-27T16:30:00Z'),
    end: null,
    summary: 'bağlık.society · 2. film gecesi',
    description: 'canavar',
    url: null,
    cancelled: false,
    stamp: new Date('2026-09-25T10:00:00Z'),
  };

  it('has no LOCATION line when no location is given', () => {
    const ics = buildIcs({ ...base, location: null });
    expect(ics).toContain('DTSTART:20260927T163000Z');
    expect(ics).not.toMatch(/^LOCATION/m);
    expect(ics).toContain('CLASS:PRIVATE');
  });

  it('includes LOCATION only when passed', () => {
    expect(buildIcs({ ...base, location: 'Moda, Kadıköy' })).toContain('LOCATION:Moda\\, Kadıköy');
  });

  it('escapes and folds per RFC 5545', () => {
    expect(escapeText('a;b,c\nd')).toBe(String.raw`a\;b\,c\nd`);
    const long = 'DESCRIPTION:' + 'ğ'.repeat(80);
    for (const line of fold(long).split('\r\n'))
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe('link health classification', () => {
  it('treats only 404/410 as broken', () => {
    expect(classify(200, 'https://a.b/x', 'https://a.b/x', null)).toBe('saglam');
    expect(classify(200, 'https://a.b/x', 'https://a.b/y', null)).toBe('yonlendirme');
    expect(classify(404, 'https://a.b/x', null, null)).toBe('kirik');
    expect(classify(410, 'https://a.b/x', null, null)).toBe('kirik');
    expect(classify(403, 'https://a.b/x', null, null)).toBe('hata');
    expect(classify(null, 'https://a.b/x', null, 'TimeoutError')).toBe('hata');
  });
});
