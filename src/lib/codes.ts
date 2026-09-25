// Access codes: 16 Crockford-base32 symbols shown as XXXX-XXXX-XXXX-XXXX.
// The first group is a non-secret *selector* (indexed lookup, like a user
// name nobody has to type separately); the remaining 12 symbols are the
// secret *verifier* (60 bits), stored only as an Argon2id hash.
import { randomBytes } from 'node:crypto';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SELECTOR_LEN = 4;
export const VERIFIER_LEN = 12;
export const CODE_LEN = SELECTOR_LEN + VERIFIER_LEN;

export function randomSymbols(n: number): string {
  // 256 is a multiple of 32, so `byte & 31` is uniform
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i]! & 31];
  return out;
}

export function generateCode(): { code: string; selector: string; verifier: string } {
  const raw = randomSymbols(CODE_LEN);
  return {
    code: formatCode(raw),
    selector: raw.slice(0, SELECTOR_LEN),
    verifier: raw.slice(SELECTOR_LEN),
  };
}

export function formatCode(raw: string): string {
  return raw.match(/.{1,4}/g)!.join('-');
}

/**
 * Accepts what people actually type or paste: any case, spaces, dashes, dots,
 * Turkish dotted/dotless i, and Crockford look-alikes (O→0, I/L→1).
 * Returns null for anything that cannot be a code (no DB lookup needed).
 */
export function normalizeCode(input: string): { selector: string; verifier: string } | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const cleaned = input
    .normalize('NFKC')
    .replace(/[ıİi]/g, 'I')
    .toUpperCase()
    .replace(/[\s\-_.·]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== CODE_LEN) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return { selector: cleaned.slice(0, SELECTOR_LEN), verifier: cleaned.slice(SELECTOR_LEN) };
}
