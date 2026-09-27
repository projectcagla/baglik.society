import type postgres from 'postgres';

/**
 * The suites' copy of film night 2. The seed keeps the real date (27 Sept
 * 2026, which has now passed); tests pin the night to the same weekday and
 * hour in 2037, so "before the night" holds whatever day the suite runs.
 * Rules that depend on the clock are tested with their own relative times.
 */
export const FIXTURE_NIGHT = {
  startsAt: '2037-09-27T19:30:00+03:00',
  iso: '2037-09-27T16:30:00.000Z',
  day: '2037-09-27',
  label: '27 eylül 2037 · pazar · 19.30',
  dtstart: 'DTSTART:20370927T163000Z',
} as const;

export async function pinFixtureNight(sql: postgres.Sql): Promise<void> {
  await sql`update events set starts_at = ${FIXTURE_NIGHT.startsAt} where number = 2`;
}
