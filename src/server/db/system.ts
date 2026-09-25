import 'server-only';
import { sql } from './client';
import type { Tx } from './context';

/**
 * Privileged transaction (table owner, RLS not applied). Import is restricted
 * by eslint to src/server/auth/** and src/server/system/** — code that must
 * work before a member identity exists (login, rate limits, sessions) or that
 * runs unattended (link checks, delivery log).
 */
export async function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await sql().begin(fn);
  return result as T;
}
