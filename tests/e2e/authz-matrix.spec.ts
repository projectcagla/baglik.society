import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { db, loginAs, state, type Who } from './helpers';

// Role × resource, over real HTTP against the production build. Each cell is
// the status the server answers with; content cells check that what must not
// reach an actor is absent from the HTML *and* the RSC payload.

const MARK = {
  draft: 'TASLAK-IZ-7Q',
  after: 'SONRA-IZ-7Q',
  film: 'taslakfilm-7q',
  place: 'GIZLI-KONUM-7Q',
};

type Actor = 'anon' | 'member' | 'outsider' | 'editor' | 'owner' | 'revoked';
type Cell = 200 | 403 | 404 | 'door';

// door = sent back to the entrance (redirect), exactly like a stranger
const ROUTES: [string, Record<Actor, Cell>][] = [
  [
    '/filmler/002-canavar/okuma',
    { anon: 'door', revoked: 'door', member: 200, outsider: 200, editor: 200, owner: 200 },
  ],
  [
    '/filmler/001-drive-my-car/sonra',
    { anon: 'door', revoked: 'door', member: 200, outsider: 200, editor: 200, owner: 200 },
  ],
  [
    '/filmler/002-canavar/sonra',
    { anon: 'door', revoked: 'door', member: 200, outsider: 200, editor: 200, owner: 200 },
  ],
  [
    '/filmler/taslak-film-7q',
    { anon: 'door', revoked: 'door', member: 404, outsider: 404, editor: 200, owner: 200 },
  ],
  [
    '/geceler/2',
    { anon: 'door', revoked: 'door', member: 200, outsider: 404, editor: 200, owner: 200 },
  ],
  [
    '/geceler/2/takvim',
    { anon: 'door', revoked: 404, member: 200, outsider: 404, editor: 200, owner: 200 },
  ],
  [
    '/geceler/2/davetiye/hikaye',
    { anon: 'door', revoked: 404, member: 200, outsider: 404, editor: 200, owner: 200 },
  ],
  ['MARKDOWN', { anon: 'door', revoked: 404, member: 404, outsider: 404, editor: 200, owner: 200 }],
  ['/masa', { anon: 'door', revoked: 'door', member: 403, outsider: 403, editor: 200, owner: 200 }],
];

let filmId = '';
let eventId = '';

async function contextFor(browser: Browser, actor: Actor) {
  const ctx = await browser.newContext();
  if (actor !== 'anon') {
    const page = await ctx.newPage();
    await loginAs(page, (actor === 'revoked' ? 'outsider' : actor) as Who);
    await page.close();
  }
  return ctx;
}

async function status(req: APIRequestContext, path: string): Promise<Cell | number> {
  const res = await req.get(path, { maxRedirects: 0 });
  if (res.status() >= 300 && res.status() < 400) {
    const to = new URL(res.headers()['location'] ?? '', 'http://x');
    return to.pathname === '/' ? 'door' : res.status();
  }
  return res.status();
}

test.describe.serial('authorisation matrix', () => {
  test.beforeAll(async () => {
    await db(async (sql) => {
      const [f] = await sql<{ id: string }[]>`select id from films where slug = '002-canavar'`;
      filmId = f!.id;
      const [e] = await sql<{ id: string }[]>`select id from events where number = 2`;
      eventId = e!.id;
      await sql`insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status, status)
                values (${filmId}, 'once', 'okuma', 'article', ${MARK.draft}, 'https://example.org/t', 'yok', 'baglanti', 'taslak')`;
      await sql`insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status, status, published_at)
                values (${filmId}, 'sonra', 'okuma', 'article', ${MARK.after}, 'https://example.org/s', 'var', 'baglanti', 'yayinda', now())`;
      await sql`insert into films (slug, title, status) values ('taslak-film-7q', ${MARK.film}, 'secildi')`;
      await sql`update event_private set location_text = ${MARK.place}, release_at = now() + interval '1 day'
                 where event_id = ${eventId}`;
    });
  });

  test.afterAll(async () => {
    await db(async (sql) => {
      await sql`delete from resources where heading in (${MARK.draft}, ${MARK.after})`;
      await sql`delete from films where slug = 'taslak-film-7q'`;
      await sql`update event_private set location_text = null, release_at = null where event_id = ${eventId}`;
      await sql`update members set status = 'active' where id = ${state().outsider.id}`;
    });
  });

  for (const actor of ['anon', 'member', 'outsider', 'editor', 'owner', 'revoked'] as Actor[]) {
    test(`${actor}: every route answers as the matrix says, and leaks nothing`, async ({
      browser,
    }) => {
      const ctx = await contextFor(browser, actor);
      if (actor === 'revoked') {
        // revoked while holding a live session cookie
        await db(
          (sql) => sql`update members set status = 'revoked' where id = ${state().outsider.id}`,
        );
      }
      try {
        for (const [route, expected] of ROUTES) {
          const path = route === 'MARKDOWN' ? `/masa/filmler/${filmId}/markdown` : route;
          expect(await status(ctx.request, path), `${actor} ${path}`).toBe(expected[actor]);
        }

        // the location is not released: no actor gets it from a page, file or image route
        for (const path of [
          '/geceler/2',
          '/geceler/2/takvim',
          '/oda',
          `/masa/geceler/${eventId}`,
        ]) {
          const body = await (await ctx.request.get(path)).text();
          expect(body, `${actor} ${path}`).not.toContain(MARK.place);
        }

        const staff = actor === 'editor' || actor === 'owner';
        for (const path of [
          '/filmler/002-canavar/okuma',
          '/filmler/002-canavar/sonra',
          '/filmler',
        ]) {
          for (const rsc of [false, true]) {
            const res = await ctx.request.get(rsc ? `${path}?_rsc=1` : path, {
              headers: rsc ? { RSC: '1' } : {},
            });
            const body = await res.text();
            if (rsc && res.status() === 200) {
              expect(res.headers()['content-type'], `${actor} ${path} rsc`).toContain(
                'text/x-component',
              );
            }
            const where = `${actor} ${path}${rsc ? ' (rsc)' : ''}`;
            if (staff) {
              if (path.endsWith('okuma')) expect(body, where).toContain(MARK.draft);
              if (path.endsWith('sonra')) expect(body, where).toContain(MARK.after);
              if (path === '/filmler') expect(body, where).toContain(MARK.film);
            } else {
              for (const m of [MARK.draft, MARK.after, MARK.film])
                expect(body, where).not.toContain(m);
            }
          }
        }
      } finally {
        await ctx.close();
        if (actor === 'revoked') {
          await db(
            (sql) => sql`update members set status = 'active' where id = ${state().outsider.id}`,
          );
        }
      }
    });
  }

  test('the preview uses member rights: drafts and the closed layer stay out', async ({
    browser,
  }) => {
    const ctx = await contextFor(browser, 'editor');
    for (const path of ['/filmler/002-canavar/okuma', '/filmler/002-canavar/sonra']) {
      for (const rsc of [false, true]) {
        const res = await ctx.request.get(`${path}?gorunum=uye${rsc ? '&_rsc=1' : ''}`, {
          headers: rsc ? { RSC: '1' } : {},
        });
        const body = await res.text();
        expect(body, path).not.toContain(MARK.draft);
        expect(body, path).not.toContain(MARK.after);
      }
    }
    await ctx.close();
  });
});
