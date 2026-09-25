import postgres from 'postgres';

export function scriptSql(url = process.env.DATABASE_URL): postgres.Sql {
  if (!url) {
    console.error('DATABASE_URL is not set (see .env.example).');
    process.exit(1);
  }
  return postgres(url, { max: 1, onnotice: () => {}, prepare: false });
}
