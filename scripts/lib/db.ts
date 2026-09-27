import postgres from 'postgres';
import { driverUrl } from '../../src/lib/db-url';

// Scripts (migrate, seed, owner) prefer a direct connection: Neon's Vercel
// integration provides it as DATABASE_URL_UNPOOLED next to the pooled URL.
export function scriptSql(
  url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
): postgres.Sql {
  if (!url) {
    console.error('DATABASE_URL is not set (see .env.example).');
    process.exit(1);
  }
  return postgres(driverUrl(url), { max: 1, onnotice: () => {}, prepare: false });
}
