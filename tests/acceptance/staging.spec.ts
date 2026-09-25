import { mkdirSync } from 'node:fs';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { base32Decode, currentStep, hotp } from '../../src/lib/totp';

// Staging acceptance — a real visitor's path through a FRESH staging
// deployment, using only synthetic accounts it creates itself:
//   first owner via /kurulum → owner key + second factor → editor, member and
//   outsider accounts → editor approves and publishes Canavar sources → member
//   reads, marks, RSVPs → location stays closed → outsider is refused → owner
//   releases a fake location to "geliyorum" → member sees it → owner withdraws it.
// Never run against production: it consumes the one-time owner setup.
// Codes are held in memory only (no traces, no screenshots of code screens).

const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';
const SHOTS = 'artifacts/acceptance';
const log: { role: string; step: string; url: string; result: string }[] = [];
const note = (role: string, step: string, page: Page, result = 'ok') =>
  log.push({ role, step, url: new URL(page.url()).pathname, result });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iphone } = devices['iPhone 13'];

async function shot(page: Page, who: string, name: string) {
  mkdirSync(`${SHOTS}/${who}`, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${who}/${name}.png`, fullPage: true });
}

async function enter(page: Page, code: string) {
  await page.goto('/');
  await page.getByLabel('giriş kodu').fill(code);
  await page.getByRole('button', { name: 'giriş', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/');
}

/** First entry with a one-time code → personal key (held in memory). */
async function firstEntry(browser: Browser, code: string, phone = false) {
  const ctx = await browser.newContext(phone ? iphone : {});
  const page = await ctx.newPage();
  await enter(page, code);
  await expect(page).toHaveURL(/\/hosgeldin$/);
  await page.getByRole('button', { name: 'anahtarımı oluştur' }).click();
  const key = (await page.locator('output').textContent())!;
  await page.goto('/oda');
  return { ctx, page, key };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (process.env.ACCEPTANCE_CONFIRM !== 'staging')
    throw new Error('refusing to run: set ACCEPTANCE_CONFIRM=staging (never production)');
  if (SETUP_TOKEN.length < 32) throw new Error('SETUP_TOKEN (32+ chars) is required');
});

test.afterAll(() => {
  mkdirSync(SHOTS, { recursive: true });
  console.table(log);
});

test('staging acceptance: anonymous, owner, editor, member, outsider', async ({ browser }) => {
  test.setTimeout(240_000);

  // ── anonymous: only the door ──────────────────────────────────────────────
  const anon = await (await browser.newContext(iphone)).newPage();
  await anon.goto('/');
  const doorHtml = (await anon.content()).toLocaleLowerCase('tr');
  for (const w of ['canavar', 'kore-eda', 'drive my car', '27 eylül'])
    expect(doorHtml, w).not.toContain(w);
  await shot(anon, 'anonymous', 'kapi');
  note('anonim', 'kapıda yalnız logo ve kod alanı', anon);
  for (const path of ['/oda', '/filmler/002-canavar/okuma', '/geceler/2']) {
    const r = await anon.request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(303);
  }
  note('anonim', 'özel adresler kapıya döner (303)', anon);

  // ── owner: one-time setup → key → second factor ───────────────────────────
  const setup = await (await browser.newContext()).newPage();
  await setup.goto('/kurulum');
  await setup.getByLabel('kurulum anahtarı').fill(SETUP_TOKEN);
  await setup.getByLabel('adın').fill('kabul kurucu (sentetik)');
  await setup.getByRole('button', { name: 'kurucuyu oluştur' }).click();
  const ownerInvite = (await setup.locator('output').textContent())!;
  expect(ownerInvite).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  const owner = await firstEntry(browser, ownerInvite);
  await owner.page.goto('/masa/uyeler');
  await owner.page.getByRole('button', { name: 'kurulumu başlat' }).click();
  const secret = ((await owner.page.locator('code').textContent()) ?? '').replace(/\s/g, '');
  await owner.page
    .getByLabel('uygulamadaki 6 haneli kod')
    .fill(hotp(base32Decode(secret), currentStep()));
  await owner.page.getByRole('button', { name: 'doğrula' }).click();
  await expect(owner.page).toHaveURL(/\/masa\/uyeler$/);
  note('kurucu', 'kurulum → kişisel anahtar → ikinci doğrulama', owner.page);
  const setupAgain = await setup.request.get('/kurulum', { maxRedirects: 0 });
  expect(setupAgain.status()).toBeGreaterThanOrEqual(300);
  note('anonim', 'kurucu oluşunca /kurulum kapandı', setup);

  // ── owner creates synthetic editor, member, outsider ──────────────────────
  const codes: Record<string, string> = {};
  for (const [name, role, invite] of [
    ['kabul editör', 'editor', false],
    ['kabul üye', 'member', true],
    ['kabul davetsiz', 'member', false],
  ] as const) {
    await owner.page.goto('/masa/uyeler');
    await owner.page.getByLabel('ad', { exact: true }).fill(name);
    if (role !== 'member') await owner.page.getByLabel('rol').selectOption(role);
    const tick = owner.page.getByLabel(/için davet et/).first();
    if (!invite) await tick.uncheck();
    await owner.page.getByRole('button', { name: 'üyeyi ekle ve davet kodu üret' }).click();
    codes[name] = (await owner.page.locator('code').first().textContent())!;
  }
  note('kurucu', 'editör, üye, davetsiz üye oluşturuldu; üye 2. geceye davetli', owner.page);

  // ── editor: approves and publishes the Canavar sources ────────────────────
  const editor = await firstEntry(browser, codes['kabul editör']!);
  await editor.page.goto('/masa');
  await expect(editor.page.getByRole('heading', { name: 'editör kuyruğu' })).toBeVisible();
  await shot(editor.page, 'editor', 'masa-kuyruk');
  const r403 = await editor.page.goto('/masa/uyeler');
  expect(r403?.status()).toBe(403);
  note('editör', 'yönetici alanı (üyeler) → 403', editor.page);
  await editor.page.goto('/masa/filmler');
  await editor.page.getByRole('link', { name: 'canavar' }).click();
  await editor.page.waitForURL(/\/masa\/filmler\/[0-9a-f-]{36}$/);
  const filmUrl = editor.page.url();
  await shot(editor.page, 'editor', 'masa-film');
  const sources = (
    await editor.page
      .locator('section[aria-labelledby="k-once"] li a[href^="/masa/kaynaklar/"]')
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
  ).filter((h, i, all) => !h.includes('/yeni') && all.indexOf(h) === i);
  expect(sources.length).toBeGreaterThanOrEqual(2);
  for (const [i, href] of sources.entries()) {
    await editor.page.goto(href);
    // a draft cannot go out before a person's check
    const suggestion = editor.page.getByRole('button', { name: 'öneriyi alana taşı' });
    if (await suggestion.count()) {
      if (i === 0) await shot(editor.page, 'editor', 'kaynak-oneri');
      await suggestion.click();
      await editor.page.getByRole('button', { name: 'kaydet', exact: true }).click();
      await expect(editor.page.getByText('kaydedildi.')).toBeVisible();
      await editor.page.reload();
    }
    await editor.page.getByRole('button', { name: 'künyeyi ve bağlantıyı kontrol ettim' }).click();
    await editor.page.getByRole('button', { name: 'yayımla' }).click();
    await expect(editor.page.getByRole('button', { name: 'taslağa al' })).toBeVisible();
  }
  note(
    'editör',
    `${sources.length} Canavar kaynağı onaylandı ve yayımlandı (sentetik onay)`,
    editor.page,
  );
  await editor.page.goto(
    filmUrl.replace(/\/masa\/filmler\/.*/, '/filmler/002-canavar/okuma?gorunum=uye'),
  );
  await expect(editor.page.getByText('üye görünümü (üye yetkisiyle)')).toBeVisible();
  note('editör', 'üye gibi önizleme (veritabanında üye yetkisi)', editor.page);

  // ── member on a phone: reading → marks → RSVP → no early location ─────────
  const member = await firstEntry(browser, codes['kabul üye']!, true);
  await expect(member.page.getByRole('heading', { level: 1 })).toHaveText('canavar');
  await expect(member.page.getByText('27 eylül 2026 · pazar · 19.30')).toBeVisible();
  await shot(member.page, 'member', 'oda');
  await member.page.getByRole('link', { name: /ön okumaya geç/ }).click();
  await expect(member.page.locator('article').first()).toBeVisible();
  await shot(member.page, 'member', 'canavar-okuma');
  await member.page.locator('article').first().getByRole('button', { name: 'okudum' }).click();
  await expect(member.page.getByText(/okuduğun: 1 \//)).toBeVisible();
  note('üye', 'ön okuma açıldı, ilk kaynak okundu olarak işaretlendi', member.page);
  await member.page.goto('/geceler/2');
  await member.page.getByText('geliyorum', { exact: true }).click();
  await member.page.getByRole('button', { name: 'kaydet' }).click();
  await expect(member.page.getByText('kaydedildi: geliyorum.')).toBeVisible();
  await member.page.reload();
  await expect(
    member.page.getByText('konum etkinlik günü davetlilere iletilecektir'),
  ).toBeVisible();
  await shot(member.page, 'member', 'canavar-gece');
  const icsBefore = await (await member.page.request.get('/geceler/2/takvim')).text();
  expect(icsBefore).not.toContain('LOCATION:');
  note('üye', 'RSVP kaydedildi; konum ve takvimde adres yok', member.page);
  const after = await member.page.goto('/filmler/002-canavar/sonra');
  expect(after?.status()).toBe(200);
  await expect(
    member.page.getByText('sonrası, gece gerçekleştikten sonra editör tarafından açılır.'),
  ).toBeVisible();
  note('üye', '"sonra" gece öncesinde kapalı', member.page);

  // ── outsider: knows the URL, gets nothing ─────────────────────────────────
  const outsider = await firstEntry(browser, codes['kabul davetsiz']!);
  const night = await outsider.page.goto('/geceler/2');
  expect(night?.status()).toBe(404);
  note('davetsiz', '/geceler/2 → 404', outsider.page);

  // ── owner releases a FAKE location to "geliyorum", then withdraws it ──────
  const FAKE = 'kabul testi · kurmaca adres';
  await owner.page.goto('/masa/geceler');
  await owner.page
    .getByRole('link', { name: /2\. film gecesi|canavar/ })
    .first()
    .click();
  await owner.page.getByLabel('gerçek konum').fill(FAKE);
  await owner.page.getByRole('button', { name: 'konum ayarlarını kaydet' }).click();
  await expect(owner.page.getByText('konum ayarları kaydedildi.')).toBeVisible();
  await member.page.goto('/geceler/2');
  expect(await member.page.content()).not.toContain(FAKE);
  await owner.page.getByRole('button', { name: 'şimdi aç' }).click();
  await member.page.reload();
  await expect(member.page.getByText(FAKE)).toBeVisible();
  expect(await (await member.page.request.get('/geceler/2/takvim')).text()).toContain('LOCATION:');
  await outsider.page.goto('/geceler/2');
  expect(await outsider.page.content()).not.toContain(FAKE);
  await owner.page.getByRole('button', { name: 'paylaşımı geri çek' }).click();
  await member.page.reload();
  await expect(member.page.getByText(FAKE)).toHaveCount(0);
  note(
    'kurucu',
    'kurmaca konum yalnız "geliyorum" diyen üyeye açıldı, sonra geri çekildi',
    owner.page,
  );
  await owner.page.getByLabel('gerçek konum').fill('');
  await owner.page.getByRole('button', { name: 'konum ayarlarını kaydet' }).click();
});
