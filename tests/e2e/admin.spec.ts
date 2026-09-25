import { expect, test } from '@playwright/test';
import { base32Decode, currentStep, hotp } from '../../src/lib/totp';
import { db, login, loginAs } from './helpers';

const totp = (secret: string, offset = 0) =>
  hotp(base32Decode(secret.replace(/\s/g, '')), currentStep() + offset);

test.describe.serial('desk', () => {
  let secret = '';
  // the owner's session that passed the second factor, reused by later steps
  let ownerState:
    Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>> | undefined;

  test('editor: content yes, members and location no', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/masa');
    await expect(page.getByRole('link', { name: 'üyeler' })).toHaveCount(0);
    expect((await page.goto('/masa/uyeler'))?.status()).toBe(403);
    await page.goto('/masa/filmler');
    await page.getByRole('link', { name: 'canavar' }).click();
    await expect(page.getByRole('heading', { name: 'künye' })).toBeVisible();
  });

  test('editor creates a draft source; members do not see it until published', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'editor');
    await page.goto('/masa/filmler');
    await page.getByRole('link', { name: 'canavar' }).click();
    await page.getByRole('link', { name: 'kaynak ekle' }).first().click();
    await page.getByLabel('türkçe başlık').fill('taslak bir okuma');
    await page.getByLabel('özgün bağlantı').fill('https://example.org/yazi');
    await page.getByLabel('türkçe özgün not (1–3 paragraf)').fill('kısa bir özgün not.');
    await page.getByRole('button', { name: 'kaynağı oluştur (taslak)' }).click();
    await expect(page.getByText('kaynak taslak olarak oluşturuldu')).toBeVisible();

    const other = await browser.newContext();
    const member = await other.newPage();
    await loginAs(member, 'member');
    await member.goto('/filmler/002-canavar/okuma');
    await expect(member.getByText('taslak bir okuma')).toHaveCount(0);

    await page.getByRole('button', { name: 'yayımla' }).first().click();
    await member.reload();
    await expect(member.getByRole('heading', { name: 'taslak bir okuma' })).toBeVisible();
    await other.close();
  });

  test('owner: second factor is required for members and location', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/masa/uyeler');
    await expect(page).toHaveURL(/\/masa\/guvenlik\?r=/);
    await page.getByRole('button', { name: 'kurulumu başlat' }).click();
    const code = page.locator('code');
    await expect(code).toBeVisible();
    secret = (await code.textContent()) ?? '';
    await page
      .getByLabel('uygulamadaki 6 haneli kod')
      .fill('000000' === totp(secret) ? '111111' : '000000');
    await page.getByRole('button', { name: 'doğrula' }).click();
    await expect(page.getByText('kod doğrulanamadı.')).toBeVisible();
    await page.getByLabel('uygulamadaki 6 haneli kod').fill(totp(secret));
    await page.getByRole('button', { name: 'doğrula' }).click();
    await expect(page).toHaveURL(/\/masa\/uyeler$/);
    ownerState = await page.context().storageState();
  });

  test('owner invites a new member; the one-time code opens the door once', async ({ browser }) => {
    const ownerCtx = await browser.newContext({ storageState: ownerState });
    const page = await ownerCtx.newPage();
    await page.goto('/masa/uyeler');
    await page.getByLabel('ad', { exact: true }).fill('yeni davetli');
    await page.getByLabel('e-posta (isteğe bağlı)').fill('yeni@example.test');
    await page.getByRole('button', { name: 'üyeyi ekle ve davet kodu üret' }).click();
    const invite = await page.locator('code').first().textContent();
    expect(invite).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await login(guest, invite!);
    await expect(guest).toHaveURL(/\/hosgeldin$/);
    await guest.getByRole('button', { name: 'anahtarımı oluştur' }).click();
    const key = await guest.locator('output').textContent();
    expect(key).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    // the invite is spent
    const again = await browser.newContext();
    const p3 = await again.newPage();
    await p3.goto('/');
    await p3.getByLabel('giriş kodu').fill(invite!);
    await p3.getByRole('button', { name: 'giriş', exact: true }).click();
    await expect(p3.getByText('kod geçerli değil.')).toBeVisible();
    // the personal key works
    await login(p3, key!);
    await expect(p3).toHaveURL(/\/oda$/);
    await ctx.close();
    await again.close();
    await ownerCtx.close();
  });

  test('owner sets and releases the location from the desk', async ({ browser }) => {
    const ownerCtx = await browser.newContext({ storageState: ownerState });
    const page = await ownerCtx.newPage();
    const [ev] = await db((sql) => sql<{ id: string }[]>`select id from events where number = 2`);
    await page.goto(`/masa/geceler/${ev!.id}`);
    await expect(page.getByText('konum girilmedi')).toBeVisible();
    await page.getByLabel('gerçek konum').fill('masa testi adresi');
    await page.getByRole('button', { name: 'konum ayarlarını kaydet' }).click();
    await expect(page.getByText('konum ayarları kaydedildi.')).toBeVisible();
    await page.getByRole('button', { name: 'şimdi aç' }).click();
    await expect(page.getByText(/açık · geliyorum diyenler/)).toBeVisible();
    // no e-mail provider: nothing is claimed as sent
    await page.getByRole('button', { name: 'konum açıldı bildirimi gönder' }).click();
    await expect(page.getByText(/uygun alıcı yok|hiçbir şey gönderilmedi/)).toBeVisible();
    await page.getByRole('button', { name: 'paylaşımı geri çek' }).click();
    await db(
      (sql) => sql`update event_private set location_text = null where event_id = ${ev!.id}`,
    );
    await ownerCtx.close();
  });
});
