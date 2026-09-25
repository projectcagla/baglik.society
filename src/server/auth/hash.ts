import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { pepperHmac } from './crypto';

// OWASP 2024 minimum for Argon2id: m = 19 MiB, t = 2, p = 1.
const OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// The verifier is HMAC-peppered first, so a leaked database alone is not
// enough to test guesses offline.
export async function hashVerifier(verifier: string): Promise<string> {
  return hash(pepperHmac(`v:${verifier}`), OPTIONS);
}

export async function checkVerifier(stored: string, verifier: string): Promise<boolean> {
  try {
    return await verify(stored, pepperHmac(`v:${verifier}`));
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Burns the same time as a real check when there is nothing to check. */
export async function burnVerify(verifier: string): Promise<void> {
  dummy ??= hash('baglik-dummy-verifier', OPTIONS);
  await checkVerifier(await dummy, verifier);
}
