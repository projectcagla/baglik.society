// Connection strings copied from a provider's dashboard (Neon adds
// `channel_binding=require`) can carry libpq-only options. postgres.js sends
// every unknown option to the server as a setting, and the server refuses the
// connection ("unrecognized configuration parameter"). Drop those here.
const LIBPQ_ONLY = ['channel_binding'];

export function driverUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const present = LIBPQ_ONLY.filter((k) => parsed.searchParams.has(k));
  if (!present.length) return url;
  for (const k of present) parsed.searchParams.delete(k);
  return parsed.toString();
}
