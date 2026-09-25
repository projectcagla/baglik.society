import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { db, loginAs } from './helpers';

const VIEWPORTS = [
  [390, 844],
  [375, 812],
  [320, 568],
  [768, 1024],
  [1440, 900],
] as const;

const MEMBER_PAGES = [
  '/oda',
  '/filmler',
  '/filmler/002-canavar',
  '/filmler/002-canavar/okuma',
  '/filmler/001-drive-my-car/sonra',
  '/geceler/2',
  '/geceler/2/davetiye',
  '/defter',
  '/profil',
];

mkdirSync('artifacts/screenshots', { recursive: true });

async function noOverflow(page: Page, label: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, `${label} scrolls sideways by ${extra}px`).toBeLessThanOrEqual(0);
  // overflow:hidden can mask a clipped control, so check the elements themselves
  const clipped = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('input, textarea, select, button, a, h1, h2, h3, p, label, img'),
    )
      .filter(
        (el) =>
          !el.closest('.visually-hidden, .skip-link, [hidden]') &&
          !el.matches('.visually-hidden, .skip-link'),
      )
      // wide tables live in their own scroll container on purpose
      .filter((el) => !el.closest('[class*="tableWrap"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(
        ({ r }) => r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1),
      )
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`,
      )
      .slice(0, 5),
  );
  expect(clipped, `${label}: elements outside the viewport`).toEqual([]);
}

const name = (p: string) =>
  p === '/'
    ? 'kapi'
    : p
        .replace(/^\//, '')
        .replace(/\/masa\/kaynaklar\/.*/, 'masa_kaynak')
        .replace(/\//g, '_');

test.describe('responsive', () => {
  for (const [w, h] of VIEWPORTS) {
    test(`${w}×${h}: no horizontal overflow, screenshots`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await noOverflow(page, `door ${w}`);
      await page.screenshot({ path: `artifacts/screenshots/${w}x${h}-kapi.png`, fullPage: true });
      await loginAs(page, 'owner');
      // a source record in the desk: long labels (approval, provenance) must wrap
      const [src] = await db(
        (sql) => sql<{ id: string }[]>`
          select r.id from resources r join films f on f.id = r.film_id
           where f.slug = '001-drive-my-car' order by r.position limit 1`,
      );
      for (const p of [...MEMBER_PAGES, '/masa', '/masa/filmler', `/masa/kaynaklar/${src!.id}`]) {
        await page.goto(p);
        await page.waitForLoadState('networkidle');
        await noOverflow(page, `${p} ${w}`);
        if (w === 390 || w === 1440 || w === 320) {
          await page.screenshot({
            path: `artifacts/screenshots/${w}x${h}-${name(p)}.png`,
            fullPage: true,
          });
        }
      }
    });
  }
});

test.describe('accessibility (axe, wcag2a/aa)', () => {
  test('door has no serious violations', async ({ page }) => {
    await page.goto('/');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('member pages have no serious violations', async ({ page }) => {
    await loginAs(page, 'member');
    for (const p of MEMBER_PAGES) {
      await page.goto(p);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious.map(
          (v) =>
            `${p} ${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    }
  });

  test('reduced motion is respected', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    const duration = await page.evaluate(
      () => getComputedStyle(document.querySelector('button[type="submit"]')!).transitionDuration,
    );
    expect(parseFloat(duration)).toBeLessThan(0.01);
    await ctx.close();
  });
});
