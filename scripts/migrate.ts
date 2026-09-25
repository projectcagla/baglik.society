// Applies db/migrations/*.sql in order, once each, inside a transaction.
//   npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { scriptSql } from './lib/db';

const dir = join(process.cwd(), 'db', 'migrations');

export async function migrate(url?: string, log = console.log) {
  const sql = scriptSql(url);
  try {
    await sql`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    const applied = new Map(
      (
        await sql<
          { name: string; checksum: string }[]
        >`select name, checksum from schema_migrations`
      ).map((r) => [r.name, r.checksum]),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const body = readFileSync(join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum)
          throw new Error(`${file} was modified after being applied. Add a new migration instead.`);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`;
      });
      log(`applied ${file}`);
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
