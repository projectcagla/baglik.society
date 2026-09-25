const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;

/**
 * Branded UI is lowercase. Turkish casing only when the string is Turkish,
 * so foreign names keep their i: "Irma Vep" → "irma vep", "IŞIK" → "ışık".
 */
export function brandLower(s: string | null | undefined): string {
  if (!s) return '';
  return TURKISH.test(s) ? s.toLocaleLowerCase('tr') : s.toLocaleLowerCase('en');
}

export function programNo(n: number | null | undefined): string {
  return n ? String(n).padStart(3, '0') : '—';
}

/** "002 / canavar" */
export function programLabel(no: number | null | undefined, title: string): string {
  return `${programNo(no)} / ${brandLower(title)}`;
}

export function readingMinutes(text: string | null | undefined, wpm = 200): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wpm));
}

const MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', ū: 'u', ō: 'o' };

export function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/['’‘ʼ]/g, '')
    .replace(/[çğıiöşüâîûūō]/g, (c) => MAP[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function filmSlug(programNo: number | null, title: string): string {
  const base = slugify(title) || 'film';
  return programNo ? `${String(programNo).padStart(3, '0')}-${base}` : base;
}

/** First letters of the first two words: "Çağla Aytaç Dursun" → "ÇA" */
export function monogram(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
  return letters.toLocaleUpperCase('tr') || '·';
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'ingilizce',
  tr: 'türkçe',
  ja: 'japonca',
  fr: 'fransızca',
  de: 'almanca',
  es: 'ispanyolca',
  it: 'italyanca',
  ko: 'korece',
  ru: 'rusça',
};

export const KIND_LABELS: Record<string, string> = {
  article: 'yazı',
  interview: 'söyleşi',
  video: 'video',
  podcast: 'podcast',
  music: 'müzik',
  essay: 'deneme',
  book: 'kitap',
  film: 'film',
  official: 'resmî metin',
  other: 'kaynak',
};

export const SPOILER_LABELS: Record<string, string | null> = {
  yok: 'spoiler yok',
  hafif: 'hafif spoiler',
  var: 'spoiler içerir',
  belirtilmedi: null,
};

export const FILM_STATUS_LABELS: Record<string, string> = {
  oneri: 'öneri',
  secildi: 'seçildi',
  yaklasiyor: 'yaklaşıyor',
  izlendi: 'izlendi',
  arsiv: 'arşiv',
};

export const SECTION_LABELS: Record<string, string> = {
  okuma: 'okuma',
  izleme: 'izle',
  eslik: 'eşlik edenler',
};
