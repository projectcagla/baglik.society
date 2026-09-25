import postgres from 'postgres';

// Rebuilds the test database from the real migrations + seed before a run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://baglik:baglik-dev@localhost:5432/baglik_test';
  if (!/test/.test(url)) throw new Error(`refusing to reset a non-test database: ${url}`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      drop schema if exists app cascade;
      drop schema if exists private cascade;
      drop schema if exists public cascade;
      create schema public;
    `);
  } finally {
    await sql.end();
  }
  const { migrate } = await import('../../scripts/migrate');
  const { seed } = await import('../../scripts/seed');
  await migrate(url, () => {});
  await seed(url, () => {});
}
