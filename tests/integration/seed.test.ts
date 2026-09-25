import { afterAll, describe, expect, it } from 'vitest';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { seed } from '../../scripts/seed';

afterAll(closeDb);

describe('seed never overwrites what the editors changed', () => {
  it('a second run leaves edited films, sources and nights exactly as they are', async () => {
    const snapshot = () =>
      asSystem(async (tx) => ({
        films: await tx`select id, title, updated_at from films order by id`,
        resources:
          await tx`select id, heading, note, status, updated_at from resources order by id`,
        events: await tx`select id, starts_at, status, updated_at from events order by id`,
      }));
    const [r] = await asSystem(
      (tx) => tx<{ id: string; heading: string }[]>`
        select r.id, r.heading from resources r join films f on f.id = r.film_id
         where f.slug = '002-canavar' and r.heading is not null order by r.position limit 1`,
    );
    await asSystem(
      (tx) => tx`update resources set heading = 'editörün düzelttiği başlık' where id = ${r!.id}`,
    );
    const before = await snapshot();
    const log: string[] = [];
    await seed(process.env.DATABASE_URL, (m) => log.push(String(m)));
    const after = await snapshot();

    expect(after).toEqual(before);
    expect(log.some((l) => l.includes('exists — skipped'))).toBe(true);
    await asSystem((tx) => tx`update resources set heading = ${r!.heading} where id = ${r!.id}`);
  });
});
