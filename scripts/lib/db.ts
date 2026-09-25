import postgres from 'postgres';

// Scripts (migrate, seed, owner) prefer a direct connection: Neon's Vercel
// integration provides it as DATABASE_URL_UNPOOLED next to the pooled URL.
export function scriptSql(
  url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
): postgres.Sql {
  if (!url) {
    console.error('DATABASE_URL is not set (see .env.example).');
    process.exit(1);
  }
  return postgres(url, { max: 1, onnotice: () => {}, prepare: false });
}
