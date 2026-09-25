import { expect, test } from '@playwright/test';
import { base32Decode, currentStep, hotp } from '../../src/lib/totp';
import { db, login, loginAs, state } from './helpers';

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
    await page.getByLabel('neden bu kaynak').fill('gösterimden önce bir bağlam kuruyor.');
    await page.getByLabel('türkçe özgün not (1–3 paragraf)').fill('kısa bir özgün not.');
    await page.getByRole('button', { name: 'kaynağı oluştur (taslak)' }).click();
    await expect(page.getByText('kaynak taslak olarak oluşturuldu')).toBeVisible();
    // a person checks the bibliography and the link before anything goes out
    await page.getByRole('button', { name: 'künyeyi ve bağlantıyı kontrol ettim' }).click();
    await expect(page.getByText('onay bekliyor')).toHaveCount(0);

    const other = await browser.newContext();
    const member = await other.newPage();
    await loginAs(member, 'member');
    await member.goto('/filmler/002-canavar/okuma');
    await expect(member.getByText('taslak bir okuma')).toHaveCount(0);

    await page.getByRole('button', { name: 'yayımla' }).first().click();
    // wait for the server to have published it (the checklist passes), then look as the member
    await expect(page.getByRole('button', { name: 'taslağa al' }).first()).toBeVisible();
    await member.reload();
    await expect(member.getByRole('heading', { name: 'taslak bir okuma' })).toBeVisible();
    await other.close();
    await db((sql) => sql`delete from resources where heading = 'taslak bir okuma'`);
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

  test('a new source: short form, checklist before publishing, a human approval', async ({
    page,
  }) => {
    await loginAs(page, 'editor');
    const [f] = await db(
      (sql) => sql<{ id: string }[]>`select id from films where slug = '002-canavar'`,
    );
    await page.goto(`/masa/kaynaklar/yeni?film=${f!.id}&layer=once`);
    // optional fields wait behind one disclosure
    await expect(page.getByLabel('erişim uyarısı')).toBeHidden();
    await page.getByLabel('türkçe başlık').fill('denetim listesi');
    await page.getByLabel('özgün bağlantı').fill('https://example.org/denetim');
    await page.getByLabel('spoiler').selectOption('belirtilmedi');
    await page.getByLabel('hak durumu').selectOption('baglanti');
    await page.getByRole('button', { name: 'kaynağı oluştur (taslak)' }).click();
    await expect(page.getByText('kaynak taslak olarak oluşturuldu')).toBeVisible();

    const list = page.getByRole('region', { name: 'yayın öncesi denetim' });
    await expect(list).toContainText('spoiler düzeyi açıkça seçildi');
    await expect(list).toContainText('(eksik)');
    await page.getByRole('button', { name: 'yayımla' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'yayın öncesi denetimde eksik' }),
    ).toBeVisible();

    await page.getByLabel('spoiler').selectOption('yok');
    await page.getByLabel('neden bu kaynak').fill('gösterimden önce bir bağlam kuruyor.');
    await page.getByRole('button', { name: 'kaydet', exact: true }).click();
    await expect(page.getByText('kaydedildi.')).toBeVisible();
    await page.goto(page.url().replace(/\?.*$/, ''));
    // everything but the human approval is in place — and that is not enough
    await expect(list).toContainText('onay bekliyor');
    await page.getByRole('button', { name: 'yayımla' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'henüz bir kişi tarafından kontrol edilmedi' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'künyeyi ve bağlantıyı kontrol ettim' }).click();
    await expect(list).not.toContainText('onay bekliyor');
    await expect(list).not.toContainText('(eksik)');
    await expect(list).toContainText('deneme editör');
    await page.getByRole('button', { name: 'yayımla' }).click();
    await expect(page.getByRole('button', { name: 'taslağa al' })).toBeVisible();

    // changing the link withdraws the approval and takes the source back to draft
    await page.getByLabel('özgün bağlantı').fill('https://example.org/denetim-yeni');
    await page.getByRole('button', { name: 'kaydet', exact: true }).click();
    await expect(page.getByText('onay düştü ve kaynak taslağa döndü')).toBeVisible();
    await db((sql) => sql`delete from resources where heading = 'denetim listesi'`);
  });

  test('the after layer of a coming film cannot be opened; the desk says why', async ({ page }) => {
    await loginAs(page, 'editor');
    const [f] = await db(
      (sql) => sql<{ id: string }[]>`select id from films where slug = '002-canavar'`,
    );
    await page.goto(`/masa/filmler/${f!.id}`);
    await page.getByRole('button', { name: 'sonrasını aç' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'ancak gösterimden sonra açılabilir' }),
    ).toBeVisible();
    const [row] = await db(
      (sql) =>
        sql<
          { after_published_at: Date | null }[]
        >`select after_published_at from films where id = ${f!.id}`,
    );
    expect(row!.after_published_at).toBeNull();
  });

  test('moderation is reversible and written down', async ({ browser }) => {
    const [c] = await db(
      (sql) => sql<{ id: string }[]>`
        insert into contributions (film_id, question_id, member_id, body, attribution, attribution_name)
        select f.id, q.id, ${state().member.id}, 'moderasyon denemesi', 'isimli', ${state().member.name}
          from films f join questions q on q.film_id = f.id and q.layer = 'sonra'
         where f.slug = '001-drive-my-car' limit 1
        returning id`,
    );
    const ownerCtx = await browser.newContext({ storageState: ownerState });
    const page = await ownerCtx.newPage();
    await page.goto('/filmler/001-drive-my-car/sonra');
    const item = page.locator('li', { hasText: 'moderasyon denemesi' });
    await item.getByRole('button', { name: 'kaldır (moderasyon)' }).click();
    await expect(item).toContainText('kaldırıldı (moderasyon)');

    const other = await browser.newContext();
    const member = await other.newPage();
    await loginAs(member, 'editor');
    await member.goto('/filmler/001-drive-my-car/sonra');
    await expect(member.getByText('moderasyon denemesi')).toHaveCount(0);

    await item.getByRole('button', { name: 'geri aç (moderasyon)' }).click();
    await expect(item.getByRole('button', { name: 'kaldır (moderasyon)' })).toBeVisible();
    await member.reload();
    await expect(member.getByText('moderasyon denemesi')).toBeVisible();

    const log = await db(
      (sql) => sql<{ state: string }[]>`
        select meta->>'state' as state from audit_logs
         where action = 'contribution.moderate' and target_id = ${c!.id} order by at`,
    );
    expect(log.map((l) => l.state)).toEqual(['kaldirildi', 'yayinda']);
    await db((sql) => sql`delete from contributions where id = ${c!.id}`);
    await other.close();
    await ownerCtx.close();
  });
});
