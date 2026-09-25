import { expect, test } from '@playwright/test';

// What anyone on the internet can learn: nothing but the door.
const PRIVATE_WORDS = [
  /canavar/i,
  /kore-eda/i,
  /drive my car/i,
  /hamaguchi/i,
  /27 eylül/i,
  /film gecesi/i,
  /bfi\.org/i,
  /criterion/i,
];

test.describe('public surface', () => {
  test('the door: one field, one action, neutral metadata', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    const headers = res!.headers();
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['referrer-policy']).toBe('same-origin');
    expect(headers['cache-control']).toMatch(/no-store/);
    await expect(page).toHaveTitle('bağlık.society');
    await expect(page.getByLabel('giriş kodu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'giriş', exact: true })).toBeVisible();
    expect(await page.locator('meta[property="og:image"]').count()).toBe(0);
    expect(await page.locator('meta[name="description"]').count()).toBe(0);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
    const html = await page.content();
    for (const w of PRIVATE_WORDS) expect(html).not.toMatch(w);
  });

  test('private URLs, existing or not, lead to the same door and leak nothing', async ({
    request,
  }) => {
    for (const path of [
      '/oda',
      '/filmler/002-canavar',
      '/filmler/002-canavar/sonra',
      '/geceler/2',
      '/geceler/2/takvim',
      '/geceler/2/davetiye/hikaye',
      '/masa',
      '/profil/veri',
      '/filmler/yok-boyle-film',
      '/api/anything',
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(303);
      expect(res.headers()['location'], path).toBe('/');
      const body = await res.text();
      for (const w of PRIVATE_WORDS) expect(body, path).not.toMatch(w);
    }
  });

  test('every script carries the CSP nonce (no page is served stale-static)', async ({
    request,
  }) => {
    for (const path of ['/', '/kayip-anahtar', '/yok-boyle-bir-sayfa-ama-herkese-acik-degil']) {
      const res = await request.get(path, { maxRedirects: 5 });
      const csp = res.headers()['content-security-policy'] ?? '';
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, path).toBeTruthy();
      const scripts = (await res.text()).match(/<script[^>]*>/g) ?? [];
      expect(scripts.length, path).toBeGreaterThan(0);
      for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`);
    }
  });

  test('cron endpoint without the secret looks like nothing', async ({ request }) => {
    expect((await request.get('/api/cron/link-check')).status()).toBe(404);
  });

  test('robots and manifest are neutral', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('bağlık.society');
  });

  test('a wrong code gets a quiet, generic answer; the keyboard is enough', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip nothing: first stop is the field
    await expect(page.getByLabel('giriş kodu')).toBeFocused();
    await page.keyboard.type('ABCD-EFGH-JKMN-PQRS');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'kod geçerli değil.' })).toBeVisible();
    await expect(page).toHaveURL('/');
    await expect(page.getByLabel('giriş kodu')).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'kodu göster' }).click();
    await expect(page.getByLabel('giriş kodu')).toHaveAttribute('type', 'text');
  });

  test('after the door, back to the page that was asked for', async ({ page }) => {
    const { state } = await import('./helpers');
    await page.goto('/filmler/002-canavar/okuma');
    await expect(page).toHaveURL('/');
    await page.getByLabel('giriş kodu').fill(state().member.key);
    await page.getByRole('button', { name: 'giriş', exact: true }).click();
    await expect(page).toHaveURL('/filmler/002-canavar/okuma');
  });

  test('works without JavaScript: the door, the room, an RSVP', async ({ browser }) => {
    const { state, db } = await import('./helpers');
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByLabel('giriş kodu').fill(state().member.key);
    await page.getByRole('button', { name: 'giriş', exact: true }).click();
    await expect(page).toHaveURL('/oda');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('canavar');
    await page.goto('/geceler/2');
    await page.getByLabel('henüz belli değil').check();
    await page.getByRole('button', { name: 'kaydet' }).click();
    await expect(page.getByText('kaydedildi: henüz belli değil.')).toBeVisible();
    await db((sql) => sql`update event_invitees set rsvp = null`);
    await ctx.close();
  });

  test('lost key without a mail provider: an honest sentence, nothing issued', async ({ page }) => {
    const { db } = await import('./helpers');
    // the e2e server has no RESEND_API_KEY / MAIL_FROM, like a fresh production
    await page.goto('/kayip-anahtar');
    await expect(page.getByText('bu kurulumda e-posta gönderimi açık değil.')).toBeVisible();
    await expect(page.getByLabel('e-posta')).toHaveCount(0);
    await expect(page.getByText(/gönderilir|gönderildi|gönderilecek/)).toHaveCount(0);
    const issued = await db(
      (sql) => sql`select 1 from private.credentials where kind = 'recovery'`,
    );
    expect(issued).toHaveLength(0);
    // with a provider, the known/unknown answer is identical (integration: auth.test.ts)
  });
});
