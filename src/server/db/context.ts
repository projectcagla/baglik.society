import 'server-only';
import type postgres from 'postgres';
import { sql } from './client';

export type Tx = postgres.TransactionSql;

/** Who the database should believe is asking. Built only from a verified session. */
export interface DbActor {
  memberId: string;
  /** true only when this session passed a second factor recently (owner/admin) */
  mfa: boolean;
}

/**
 * Runs `fn` in a transaction as the restricted `baglik_app` role with the
 * member's identity bound to the transaction. Every read and write inside is
 * filtered by the row level security policies in db/migrations/0002_rls.sql.
 */
export async function asMember<T>(actor: DbActor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await sql().begin(async (tx) => {
    await tx.unsafe('set local role baglik_app');
    await tx`
      select set_config('app.member_id', ${actor.memberId}, true),
             set_config('app.mfa', ${actor.mfa ? 'on' : 'off'}, true)`;
    return fn(tx);
  });
  return result as T;
}

/** Same role, no identity: what an anonymous visitor would get (nothing). */
export async function asAnonymous<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await sql().begin(async (tx) => {
    await tx.unsafe('set local role baglik_app');
    return fn(tx);
  });
  return result as T;
}
