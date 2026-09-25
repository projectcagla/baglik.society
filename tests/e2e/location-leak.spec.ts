import { expect, test } from '@playwright/test';
import { db, loginAs } from './helpers';

// Regression guard for the one real secret: the venue of film night 002.
const SECRET = 'SIZINTI-TESTI Moda Caddesi 77';

test.describe.serial('location leak regression', () => {
  test.afterAll(async () => {
    await db(
      (
        sql,
      ) => sql`update event_private set location_text = null, release_at = null, released_at = null,
                            release_audience = 'katilanlar'
                          where event_id = (select id from events where number = 2)`,
    );
    await db((sql) => sql`update event_invitees set rsvp = null`);
  });

  test('before release the venue is in no page, payload or calendar file', async ({ page }) => {
    await db(
      (
        sql,
      ) => sql`update event_private set location_text = ${SECRET}, release_at = now() + interval '12 hours'
                          where event_id = (select id from events where number = 2)`,
    );
    await loginAs(page, 'member');
    // RSVP yes, so the only thing withholding it is the release time
    await page.goto('/geceler/2');
    await page.getByText('geliyorum', { exact: true }).click();
    await page.getByRole('button', { name: 'kaydet' }).click();
    await expect(page.getByText('katılımın kaydedildi.')).toBeVisible();

    for (const path of [
      '/oda',
      '/geceler',
      '/geceler/2',
      '/geceler/2/davetiye',
      '/filmler/002-canavar',
    ]) {
      const res = await page.request.get(path);
      const body = await res.text();
      expect(body, path).not.toContain('SIZINTI-TESTI');
      // RSC payload of a client navigation too
      const rsc = await page.request.get(path, { headers: { RSC: '1' } });
      expect(await rsc.text(), `${path} (rsc)`).not.toContain('SIZINTI-TESTI');
    }
    const ics = await page.request.get('/geceler/2/takvim');
    expect(ics.headers()['content-type']).toContain('text/calendar');
    const icsBody = await ics.text();
    expect(icsBody).not.toContain('SIZINTI-TESTI');
    expect(icsBody).not.toMatch(/^LOCATION/m);
    await page.goto('/geceler/2');
    await expect(page.getByText('konum etkinlik günü davetlilere iletilecektir')).toBeVisible();
  });

  test('after release the attending invitee sees it — the outsider never does', async ({
    page,
    browser,
  }) => {
    await db(
      (sql) => sql`update event_private set release_at = now() - interval '1 minute'
                          where event_id = (select id from events where number = 2)`,
    );
    await loginAs(page, 'member');
    await page.goto('/geceler/2');
    await expect(page.getByText(SECRET)).toBeVisible();
    expect(await (await page.request.get('/geceler/2/takvim')).text()).toContain(
      'LOCATION:SIZINTI-TESTI',
    );

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await loginAs(p2, 'outsider');
    const res = await p2.request.get('/geceler/2');
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain('SIZINTI-TESTI');
    expect((await p2.request.get('/geceler/2/takvim')).status()).toBe(404);
    await other.close();
  });

  test('released without an address: honest fallback', async ({ page }) => {
    await db(
      (sql) => sql`update event_private set location_text = null, released_at = now()
                          where event_id = (select id from events where number = 2)`,
    );
    await loginAs(page, 'member');
    await page.goto('/geceler/2');
    await expect(page.getByText('konum bilgisi henüz paylaşılmadı.')).toBeVisible();
  });
});
