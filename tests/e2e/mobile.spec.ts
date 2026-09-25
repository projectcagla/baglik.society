import { mkdirSync } from 'node:fs';
import { devices, expect, test, type Page } from '@playwright/test';
import { db, loginAs } from './helpers';

// A real member on a phone. Runs in Chromium and, in CI, in WebKit (the
// engine behind Safari on iPhone) — the two must behave the same.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
test.use(iphone);

async function noOverflow(page: Page, label: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, `${label} scrolls sideways by ${extra}px`).toBeLessThanOrEqual(0);
}

test.describe('member on a phone', () => {
  test('oda → okuma → gece, with bigger text and thumb-sized targets', async ({
    page,
    browserName,
  }, info) => {
    const dir = `artifacts/qa/${info.project.name}/member`;
    mkdirSync(dir, { recursive: true });
    await loginAs(page, 'member');

    // oda: one night, one way into the reading
    const hero = page.locator('section[aria-labelledby="gece-baslik"]');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('canavar');
    await expect(hero).toContainText('27 eylül 2026 · pazar · 19.30');
    await noOverflow(page, 'oda');
    await page.screenshot({ path: `${dir}/oda.png` });
    await hero.getByRole('link', { name: /ön okumaya geç/ }).tap();

    // okuma: the first screen is the reading; the index jumps to a source
    await expect(page).toHaveURL(/\/filmler\/002-canavar\/okuma$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByText(/temel okuma · .*bu sayfadaki notlar/)).toBeInViewport();
    await page.screenshot({ path: `${dir}/canavar-okuma.png` });
    const index = page.getByRole('navigation', { name: 'bu dosyada' });
    await index.getByRole('link').nth(1).tap();
    const second = page.locator('article').nth(1);
    await expect(second.getByRole('heading', { level: 2 })).toBeInViewport();
    // touch targets on the marks are at least 44 px tall
    const box = await second.getByRole('button', { name: 'okudum' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await second.getByRole('button', { name: 'okudum' }).tap();
    await expect(second.getByRole('button', { name: 'okudum ✓' })).toBeVisible();
    await noOverflow(page, 'okuma');

    // larger system text (150 %) keeps the page readable, without sideways scroll
    await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
    await noOverflow(page, 'okuma @150%');

    // gece: RSVP from the phone, the result stays after a reload
    await page.goto('/geceler/2');
    await expect(page.getByText('konum etkinlik günü davetlilere iletilecektir')).toBeVisible();
    await page.getByText('geliyorum', { exact: true }).tap();
    await page.getByRole('button', { name: 'kaydet' }).tap();
    await expect(page.getByText('kaydedildi: geliyorum.')).toBeVisible();
    await page.reload();
    await expect(page.locator('section[aria-labelledby="gece-baslik"]')).toContainText(
      'davetlisin · katılımın: geliyorum',
    );
    await noOverflow(page, 'gece');
    await page.screenshot({ path: `${dir}/canavar-gece.png` });

    for (const [path, name] of [
      ['/filmler/001-drive-my-car/sonra', 'drive-my-car-sonra'],
      ['/defter', 'defter'],
    ] as const) {
      await page.goto(path);
      await noOverflow(page, name);
      await page.screenshot({ path: `${dir}/${name}.png` });
    }
    expect(browserName).toBeTruthy();
    await db((sql) => sql`update event_invitees set rsvp = null`);
    await db((sql) => sql`delete from resource_marks`);
  });

  test('without JavaScript the reading is complete and the RSVP still works', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...iphone, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    await expect(page.getByRole('heading', { name: 'Ailenin sınırları' })).toBeVisible();
    await page.goto('/geceler/2');
    await page.getByLabel('henüz belli değil').check();
    await page.getByRole('button', { name: 'kaydet' }).click();
    await page.goto('/geceler/2');
    await expect(page.locator('section[aria-labelledby="gece-baslik"]')).toContainText(
      'katılımın: henüz belli değil',
    );
    await db((sql) => sql`update event_invitees set rsvp = null`);
    await ctx.close();
  });
});
