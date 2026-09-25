import { describe, expect, it } from 'vitest';
import { publishChecklist, readyToPublish, type PublishFields } from '@/lib/publish-check';

const ok: PublishFields = {
  heading: 'Gündelik hayatın ayrıntıları',
  title_original: 'Where to begin with Hirokazu Koreeda',
  url: 'https://www.bfi.org.uk/features/where-begin-hirokazu-koreeda',
  layer: 'once',
  spoiler_level: 'yok',
  rights_status: 'ozgun_ozet',
  rights_note: null,
  note: 'kısa bir özgün not.',
};

const failing = (r: Partial<PublishFields>) =>
  publishChecklist({ ...ok, ...r })
    .filter((c) => !c.ok)
    .map((c) => c.key);

describe('pre-publish checklist', () => {
  it('a complete record passes', () => {
    expect(readyToPublish(ok)).toBe(true);
  });

  it('names exactly what is missing', () => {
    expect(failing({ heading: null, title_original: ' ' })).toEqual(['baslik']);
    expect(failing({ url: null })).toEqual(['baglanti']);
    expect(failing({ url: 'javascript:alert(1)' })).toEqual(['baglanti']);
    expect(failing({ url: 'ftp://example.org/x' })).toEqual(['baglanti']);
    expect(failing({ rights_status: 'lisansli_ceviri' })).toEqual(['haklar']);
    expect(failing({ note: '' })).toEqual(['not']);
    expect(failing({ spoiler_level: 'belirtilmedi' })).toEqual(['spoiler']);
    expect(failing({ spoiler_level: 'var' })).toEqual(['katman']);
  });

  it('context decides: own texts need no link, links need no note, spoilers go after', () => {
    expect(failing({ rights_status: 'kendi_icerigi', url: null })).toEqual([]);
    expect(failing({ rights_status: 'baglanti', note: null })).toEqual([]);
    expect(failing({ layer: 'sonra', spoiler_level: 'var' })).toEqual([]);
  });
});
