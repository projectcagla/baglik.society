import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eEnv } from '../../playwright.config';
import { db, loginAs, state } from './helpers';

// What a stranger, a crawler or a forged form can learn: nothing.
const PRIVATE_WORDS = [
  'canavar',
  'kore-eda',
  'koreeda',
  'drive my car',
  'hamaguchi',
  '27 eylül',
  '2026-09-27',
  'deneme üye',
  'example.test',
];

test.describe('anonymous surface', () => {
  test('HEAD and GET on private URLs answer like any unknown URL', async ({ request }) => {
    for (const path of ['/filmler/002-canavar/okuma', '/geceler/2', '/masa', '/bu-yok']) {
      for (const method of ['HEAD', 'GET'] as const) {
        const res = await request.fetch(path, { method, maxRedirects: 0 });
        expect(res.status(), `${method} ${path}`).toBe(303);
        expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe('/');
        expect(res.headers()['cache-control']).toContain('no-store');
      }
    }
  });

  test('link-preview bots and crawlers see a door with nothing on it', async ({ request }) => {
    for (const ua of [
      'facebookexternalhit/1.1',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'WhatsApp/2.23.20.0',
      'Twitterbot/1.0',
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
    ]) {
      const deep = await request.get('/filmler/002-canavar', {
        headers: { 'User-Agent': ua },
        maxRedirects: 0,
      });
      expect(deep.status(), ua).toBe(303);
      const door = await request.get('/', { headers: { 'User-Agent': ua } });
      const html = (await door.text()).toLocaleLowerCase('tr');
      for (const w of PRIVATE_WORDS) expect(html, `${ua}: ${w}`).not.toContain(w);
      expect(html).not.toMatch(/og:image|twitter:image/);
      expect(door.headers()['x-robots-tag']).toContain('noindex');
    }
  });

  test('first-owner setup is closed once an owner exists (and without a token)', async ({
    request,
  }) => {
    const res = await request.get('/kurulum', { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe('/');
  });

  test('the health signal is public and says one word', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers()['cache-control']).toContain('no-store');
  });

  test('no server secret or connection string reaches the browser bundle', async () => {
    const secrets = [
      e2eEnv.AUTH_PEPPER,
      e2eEnv.APP_ENCRYPTION_KEY,
      e2eEnv.CRON_SECRET,
      e2eEnv.DATABASE_URL,
      'postgres://',
      'baglik-dev',
    ];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|json|txt|html)$/.test(f)) files.push(p);
      }
    };
    walk('.next/static');
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const body = readFileSync(f, 'utf8');
      for (const s of secrets) expect(body.includes(s), `${s} in ${f}`).toBe(false);
    }
  });
});

test.describe('forged requests', () => {
  test('a form posted from another origin does not sign anyone in', async ({ page, request }) => {
    await page.goto('/');
    // the door's own server action id, taken from the real page
    const action = await page
      .locator('form input[type="hidden"][name^="$ACTION_"]')
      .first()
      .getAttribute('name');
    expect(action).toBeTruthy();
    const res = await request.post('/', {
      headers: { Origin: 'https://evil.example', 'Content-Type': 'multipart/form-data' },
      multipart: { [action!]: '', code: state().member.key },
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(200);
    expect(res.headers()['set-cookie'] ?? '').not.toContain('bs_session');
  });
});

test.describe('own data', () => {
  test('a member can download their own records, and only theirs', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/defter');
    await page.getByLabel('not', { exact: true }).first().fill('dışa aktarım denemesi');
    await page.getByRole('button', { name: 'kaydet' }).first().click();
    await expect(page.getByText('not kaydedildi. yalnızca sen görebilirsin.')).toBeVisible();
    const res = await page.request.get('/profil/veri');
    expect(res.headers()['content-disposition']).toContain('attachment');
    expect(res.headers()['cache-control']).toContain('no-store');
    const body = await res.text();
    expect(body).toContain('dışa aktarım denemesi');
    expect(body).toContain(state().member.name);
    for (const other of [state().owner.name, state().editor.name, state().outsider.name])
      expect(body).not.toContain(other);
    // no secrets about the account itself either
    expect(body).not.toContain(state().member.key);
    await db((sql) => sql`delete from journal_entries where body = 'dışa aktarım denemesi'`);
  });
});
