import 'server-only';
import postgres from 'postgres';
import { env } from '@/server/env';

// One pool per server instance. `prepare: false` keeps the driver compatible
// with transaction-mode poolers (Supabase :6543, PgBouncer); RLS context is
// transaction-scoped (SET LOCAL / set_config(..., true)) so pooling is safe.
const globalForDb = globalThis as unknown as { __baglikSql?: postgres.Sql };

export function sql(): postgres.Sql {
  if (!globalForDb.__baglikSql) {
    const e = env();
    globalForDb.__baglikSql = postgres(e.DATABASE_URL, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      prepare: e.DB_PREPARE === 'true',
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalForDb.__baglikSql;
}

/** For CLI scripts and tests. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__baglikSql) {
    await globalForDb.__baglikSql.end({ timeout: 5 });
    globalForDb.__baglikSql = undefined;
  }
}
