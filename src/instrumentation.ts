// Runs once when a server process starts, before it answers any request.
// Self-hosted installs without a build step that can reach the database
// (cPanel / Passenger, see docs/CPANEL_KURULUM.md) set MIGRATE_ON_BOOT=1 so
// every start brings the schema and the seed content up to date. Vercel runs
// the same steps in `vercel-build` instead and leaves this switched off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.MIGRATE_ON_BOOT !== '1') return;
  const { prepareDatabase } = await import('./server/system/boot');
  await prepareDatabase();
}
