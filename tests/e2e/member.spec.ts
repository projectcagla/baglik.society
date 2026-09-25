import { expect, test } from '@playwright/test';
import { db, loginAs } from './helpers';

test.describe('member', () => {
  test('first screen: the next night, nothing else loud', async ({ page }) => {
    await loginAs(page, 'member');
    const hero = page.locator('section[aria-labelledby="gece-baslik"]');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('canavar');
    await expect(hero).toContainText('002');
    await expect(hero).toContainText('hirokazu kore-eda');
    await expect(hero).toContainText('27 eylül 2026 · pazar · 19.30');
    await expect(hero).toContainText('konum etkinlik günü davetlilere iletilecektir');
    await expect(page.getByRole('link', { name: /ön okumaya geç/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'katılımını bildir' })).toBeVisible();
    await expect(page.getByRole('link', { name: '001 / drive my car' })).toBeVisible();
    // no fake social proof
    await expect(page.locator('body')).not.toContainText(/kişi geliyor/);
  });

  test('pre-reading: editorial notes, original sources, no spoilers layer', async ({ page }) => {
    await loginAs(page, 'member');
    await page.getByRole('link', { name: /ön okumaya geç/ }).click();
    await expect(page).toHaveURL(/\/filmler\/002-canavar\/okuma$/);
    await expect(page.getByRole('heading', { name: 'Gündelik hayatın ayrıntıları' })).toBeVisible();
    await expect(page.getByText('Where to begin with Hirokazu Koreeda')).toBeVisible();
    const link = page.getByRole('link', { name: /orijinal makaleyi aç/ }).first();
    await expect(link).toHaveAttribute(
      'href',
      'https://www.bfi.org.uk/features/where-begin-hirokazu-koreeda',
    );
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByText('birebir çeviri değildir')).toBeVisible();
    await expect(
      page.getByText('Bir karaktere yaklaşmak, onu açıklamak anlamına gelir mi?'),
    ).toBeVisible();
    // the after layer is closed for 002
    await page.goto('/filmler/002-canavar/sonra');
    await expect(
      page.getByText('sonrası, gece gerçekleştikten sonra editör tarafından açılır.'),
    ).toBeVisible();
  });

  test('archive: drive my car with its after layer and discussion', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler');
    await page.getByRole('link', { name: /drive my car/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('drive my car');
    await page.getByRole('link', { name: 'sonra', exact: true }).click();
    await expect(
      page.getByText(
        'Bir başkasını gerçekten tanımak için onun bütün hikâyesini bilmek gerekir mi?',
      ),
    ).toBeVisible();
    await page.getByText('düşünceni ekle').click();
    await page.getByLabel('düşüncen').fill('Hikâyenin tamamı değil, dinlemeye razı olmak.');
    await page.getByRole('button', { name: 'ekle' }).click();
    await expect(page.getByText('Hikâyenin tamamı değil, dinlemeye razı olmak.')).toBeVisible();
    // the record states only what happened; no empty editor-note placeholder for members
    await expect(page.getByRole('heading', { name: 'masadan kalan sorular' })).toBeVisible();
    await expect(page.getByText('izlendi · tarihi kayda geçmedi')).toBeVisible();
    await expect(page.getByText(/notları henüz yazılmadı|editör notu yok/)).toHaveCount(0);
    // withdrawing is the only way to take words back
    const mine = page.locator('li', { hasText: 'Hikâyenin tamamı değil' });
    await expect(mine.getByRole('button', { name: /düzenle/ })).toHaveCount(0);
    await mine.getByRole('button', { name: 'geri çek' }).click();
    await expect(page.getByText('Hikâyenin tamamı değil, dinlemeye razı olmak.')).toHaveCount(0);
  });

  test('RSVP, calendar file and invitation exports', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/geceler/2');
    await page.getByText('gelemiyorum', { exact: true }).click();
    await page.getByRole('button', { name: 'kaydet' }).click();
    await expect(page.getByText('kaydedildi: gelemiyorum.')).toBeVisible();
    const ics = await page.request.get('/geceler/2/takvim');
    expect(await ics.text()).toContain('DTSTART:20260927T163000Z');
    for (const f of ['hikaye', 'gonderi', 'kart']) {
      const res = await page.request.get(`/geceler/2/davetiye/${f}`);
      expect(res.status(), f).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
      expect(res.headers()['cache-control']).toContain('no-store');
    }
    const jpg = await page.request.get('/geceler/2/davetiye/hikaye?bicim=jpg');
    expect(jpg.headers()['content-type']).toBe('image/jpeg');
    await db((sql) => sql`update event_invitees set rsvp = null`);
  });

  test('journal: private by default, sharing is explicit', async ({ page, browser }) => {
    await loginAs(page, 'member');
    await page.goto('/defter');
    await page.getByLabel('not', { exact: true }).first().fill('yalnızca bana ait bir not');
    await page.getByRole('button', { name: 'kaydet' }).first().click();
    await expect(page.getByText('not kaydedildi. yalnızca sen görebilirsin.')).toBeVisible();
    await expect(page.locator('li p', { hasText: 'yalnızca bana ait bir not' })).toBeVisible();

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await loginAs(p2, 'editor');
    await p2.goto('/defter');
    await expect(p2.locator('li p', { hasText: 'yalnızca bana ait bir not' })).toHaveCount(0);
    await other.close();
  });

  test('members cannot reach the desk', async ({ page }) => {
    await loginAs(page, 'member');
    const res = await page.goto('/masa');
    expect(res?.status()).toBe(403);
    await expect(page.getByText('bu bölüm sana açık değil.')).toBeVisible();
  });

  test('logout ends the session server-side', async ({ page }) => {
    await loginAs(page, 'member');
    const cookies = await page.context().cookies();
    await page.getByRole('button', { name: 'çıkış' }).first().click();
    await expect(page).toHaveURL('/');
    // replaying the old cookie does not work
    await page.context().addCookies(cookies);
    await page.goto('/oda');
    await expect(page).toHaveURL('/');
  });
});
