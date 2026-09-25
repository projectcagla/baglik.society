import { expect, test } from '@playwright/test';
import { db, loginAs } from './helpers';

// v1.1: önce → gece, on a phone first.
test.describe('reading room (önce)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the first phone screen is the reading, not the chrome', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('canavar');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByText('hirokazu kore-eda · 2023')).toBeInViewport();
    await expect(page.getByText(/002\s*\/\s*gösterim öncesi/)).toBeInViewport();
    // the count is the real number of published pre-screening sources
    const [count] = await db(
      (sql) => sql<{ n: number }[]>`
        select count(*)::int as n from resources r join films f on f.id = r.film_id
         where f.slug = '002-canavar' and r.layer = 'once' and r.status = 'yayinda'`,
    );
    const meta = page.getByText(
      new RegExp(`^${count!.n} kaynak · bu sayfadaki notlar yaklaşık \\d+ dk`),
    );
    await expect(meta).toBeInViewport();
    await expect(
      page.getByRole('navigation', { name: 'bu dosyada' }).getByRole('link').first(),
    ).toBeInViewport();
    // the three documents, with the after layer honestly closed
    const docs = page.getByRole('navigation', { name: 'filmin belgeleri' });
    await expect(docs.getByRole('link', { name: 'önce' })).toHaveAttribute('aria-current', 'page');
    await expect(docs.getByRole('link', { name: 'gece' })).toHaveAttribute('href', '/geceler/2');
    await expect(docs).toContainText('sonra · geceden sonra');
    await expect(docs.getByRole('link', { name: /sonra/ })).toHaveCount(0);
  });

  test('each source: heading, original, labels, spoiler note before the link', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    const entry = page.locator('article', { hasText: 'Gündelik hayatın ayrıntıları' });
    await expect(entry.getByText('Where to begin with Hirokazu Koreeda')).toBeVisible();
    await expect(entry.getByText(/spoiler yok/)).toBeVisible();
    await expect(entry.getByRole('link', { name: /orijinal makaleyi aç/ })).toBeVisible();

    const crew = page.locator('article', { hasText: 'Yaratıcı ekip' });
    const note = crew.getByRole('note');
    await expect(note).toContainText('spoiler uyarısı');
    // the warning comes before the way out, in the document itself (not CSS)
    const order = await crew.evaluate((el) => {
      const warn = el.querySelector('[role="note"]');
      const link = el.querySelector('a[target="_blank"]');
      return !!warn && !!link && !!(warn.compareDocumentPosition(link) & 4);
    });
    expect(order).toBe(true);
  });

  test('okudum / sonra oku are private marks; the index remembers', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    const entry = page.locator('article', { hasText: 'Bir başkasının iç dünyası' });
    await entry.getByRole('button', { name: 'sonra oku' }).click();
    await expect(entry.getByRole('button', { name: 'sonra oku ✓' })).toBeVisible();
    await entry.getByRole('button', { name: 'okudum' }).click();
    await expect(entry.getByRole('button', { name: 'okudum ✓' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'bu dosyada' })
        .getByRole('link', { name: /Bir başkasının iç dünyası/ }),
    ).toHaveAttribute('data-read', '');
    await page.goto('/defter');
    await expect(page.getByText('Bir başkasının iç dünyası').first()).toBeVisible();
    await db((sql) => sql`delete from resource_marks`);
  });

  test('"bağlantı açılmıyor mu?" reaches the desk once', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    const entry = page.locator('article', { hasText: 'Hafızanın bugünü' });
    await entry.getByRole('button', { name: 'bağlantı açılmıyor mu?' }).click();
    await expect(entry.getByText('bildirildi; editör kontrol edecek.')).toBeVisible();
    const [row] = await db(
      (sql) =>
        sql<
          { n: number }[]
        >`select link_report_count as n from resources where heading = 'Hafızanın bugünü'`,
    );
    expect(row!.n).toBe(1);
    await db(
      (sql) =>
        sql`update resources set link_report_count = 0, link_reported_at = null where heading = 'Hafızanın bugünü'`,
    );
  });

  test('"kaldığın yer" returns to the last source, stored only on this device', async ({
    page,
  }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    await page.locator('article', { hasText: 'Ailenin sınırları' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.goto('/filmler/002-canavar/okuma');
    const place = page.getByRole('link', { name: /kaldığın yer/ });
    await expect(place).toContainText('Ailenin sınırları');
    await place.click();
    await expect(page.locator('article', { hasText: 'Ailenin sınırları' })).toBeInViewport();
    const stored = await page.evaluate(() => localStorage.getItem('bs-okuma:002-canavar'));
    expect(stored).toContain('Ailenin sınırları');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });

  test('the whole reading is in the HTML, readable and printable', async ({ page }) => {
    // the door is a plain form post, so this also proves no-JS entry
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar/okuma');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('canavar');
    for (const h of [
      'Gündelik hayatın ayrıntıları',
      'Bir başkasının iç dünyası',
      'Hafızanın bugünü',
      'Ailenin sınırları',
    ]) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    await expect(page.getByText('spoiler uyarısı').first()).toBeVisible();
  });
});

test.describe('the night (gece)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('reads like the invitation and leads to the reading', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/geceler/2');
    const hero = page.locator('section[aria-labelledby="gece-baslik"]');
    await expect(hero.locator('img[src="/brand/portal.webp"]')).toBeVisible();
    await expect(hero).toContainText('002');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('canavar');
    await expect(hero).toContainText('hirokazu kore-eda');
    await expect(hero).toContainText('27 eylül 2026 · pazar · 19.30');
    await expect(hero).toContainText('konum etkinlik günü davetlilere iletilecektir');
    await expect(hero).toContainText('davetlisin · katılımını henüz bildirmedin');
    await hero.getByRole('link', { name: /ön okumaya geç/ }).click();
    await expect(page).toHaveURL(/\/filmler\/002-canavar\/okuma$/);
  });

  test('RSVP: the result is stated, repeating it changes nothing', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/geceler/2');
    for (let i = 0; i < 2; i++) {
      await page.getByText('geliyorum', { exact: true }).click();
      await page.getByRole('button', { name: 'kaydet' }).click();
      await expect(page.getByText('kaydedildi: geliyorum.')).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('section[aria-labelledby="gece-baslik"]')).toContainText(
      'davetlisin · katılımın: geliyorum',
    );
    const rows = await db(
      (sql) => sql`select 1 from event_invitees i join events e on e.id = i.event_id
                    where e.number = 2 and i.rsvp = 'geliyorum'`,
    );
    expect(rows).toHaveLength(1);
    await db((sql) => sql`update event_invitees set rsvp = null`);
  });
});

test.describe('the film dossier', () => {
  test('önce · gece · sonra, and a private layer that is only yours', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/filmler/002-canavar');
    await expect(page.getByRole('heading', { name: 'gösterim öncesi', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: '2. film gecesi' })).toHaveAttribute(
      'href',
      '/geceler/2',
    );
    await expect(
      page.getByText('sonrası, gece gerçekleştikten sonra editör tarafından açılır.'),
    ).toBeVisible();
    await expect(page.getByText('senin için · yalnızca sen görürsün')).toBeVisible();
    await expect(page.getByText(/okuduğun: 0 \/ \d+ kaynak/)).toBeVisible();

    await page.goto('/filmler/001-drive-my-car');
    await expect(page.getByText('izlendi; gecenin tarihi kayda geçmedi.')).toBeVisible();
    await page.getByRole('link', { name: /sonrasına geç/ }).click();
    await expect(page).toHaveURL(/\/filmler\/001-drive-my-car\/sonra$/);
  });
});
