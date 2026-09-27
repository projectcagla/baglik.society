// Applies db/migrations/*.sql in order, once each, inside a transaction.
//   npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { scriptSql } from './lib/db';

// resolved per call: the standalone server changes directory before booting
const migrationsDir = () => join(process.cwd(), 'db', 'migrations');

// Every step takes the same transaction-scoped advisory lock and re-reads
// schema_migrations inside it, so two servers booting at once (Passenger may
// start more than one process) apply each file exactly once.
const LOCK = 'baglik:migrate';

/** `until`: stop after this file (upgrade tests start from an older schema). */
export async function migrate(url?: string, log = console.log, opts: { until?: string } = {}) {
  const sql = scriptSql(url);
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${LOCK}))`;
      await tx`create table if not exists schema_migrations (
        name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    });
    const files = readdirSync(migrationsDir())
      .filter((f) => f.endsWith('.sql') && (!opts.until || f <= opts.until))
      .sort();
    for (const file of files) {
      const body = readFileSync(join(migrationsDir(), file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const applied = await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${LOCK}))`;
        const [prev] = await tx<
          { checksum: string }[]
        >`select checksum from schema_migrations where name = ${file}`;
        if (prev) {
          if (prev.checksum !== checksum)
            throw new Error(
              `${file} was modified after being applied. Add a new migration instead.`,
            );
          return false;
        }
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`;
        return true;
      });
      if (applied) log(`applied ${file}`);
    }
    log('migrations up to date');
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  migrate().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
