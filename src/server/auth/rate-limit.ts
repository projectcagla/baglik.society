import 'server-only';
import type { Tx } from '@/server/db/context';
import { pepperHmac } from './crypto';

// Failure budgets. Counted in Postgres so they hold across serverless
// instances without an extra service.
export const LIMITS = {
  ip: { failures: 10, windowMin: 15 },
  selector: { failures: 8, windowMin: 60 },
  global: { failures: 300, windowMin: 10 },
  mfa: { failures: 5, windowMin: 15 },
  recoveryIp: { failures: 5, windowMin: 60 },
  recoveryEmail: { failures: 3, windowMin: 24 * 60 },
  setup: { failures: 5, windowMin: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** IPs are never stored in clear text. */
export function ipBucket(ip: string | null): string {
  return `ip:${pepperHmac(`ip:${ip ?? 'unknown'}`).slice(0, 24)}`;
}

export async function failuresSince(tx: Tx, bucket: string, windowMin: number): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    select count(*)::int as n from private.auth_attempts
     where bucket = ${bucket} and not success and at > now() - make_interval(mins => ${windowMin})`;
  return row?.n ?? 0;
}

export async function isLimited(tx: Tx, bucket: string, limit: LimitName): Promise<boolean> {
  const l = LIMITS[limit];
  return (await failuresSince(tx, bucket, l.windowMin)) >= l.failures;
}

export async function record(tx: Tx, buckets: string[], success: boolean): Promise<void> {
  for (const bucket of buckets) {
    await tx`insert into private.auth_attempts (bucket, success) values (${bucket}, ${success})`;
  }
}

/** Housekeeping; called opportunistically. */
export async function pruneAttempts(tx: Tx): Promise<void> {
  await tx`delete from private.auth_attempts where at < now() - interval '2 days'`;
}
