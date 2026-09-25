import { expect, test, type Page } from '@playwright/test';
import { base32Decode, currentStep, hotp } from '../../src/lib/totp';
import { db, login, loginAs, state } from './helpers';

// One person's whole season, end to end, against the production build:
// invitation → first entry → personal key → pre-reading → marks → RSVP →
// location closed → location released → calendar → after layer opened by
// hand → contribution → withdrawal → archive.
const PLACE = 'yolculuk testi · kurmaca adres';

async function passSecondFactor(page: Page) {
  const secret = state().admin.totp!;
  await expect(page).toHaveURL(/\/masa\/guvenlik/);
  await page
    .getByLabel('uygulamadaki 6 haneli kod')
    .fill(hotp(base32Decode(secret.replace(/\s/g, '')), currentStep()));
  await page.getByRole('button', { name: 'doğrula' }).click();
}

test.describe.serial('a season, end to end', () => {
  let filmId = '';
  let eventId = '';

  test.beforeAll(async () => {
    await db(async (sql) => {
      filmId = (await sql`select id from films where slug = '002-canavar'`)[0]!.id;
      eventId = (await sql`select id from events where number = 2`)[0]!.id;
    });
  });

  test.afterAll(async () => {
    // leave the shared e2e database as the other specs expect it
    await db(async (sql) => {
      await sql`update films set status = 'yaklasiyor' where id = ${filmId}`;
      await sql`update films set after_published_at = null where id = ${filmId}`;
      await sql`update event_private set location_text = null, release_at = null, released_at = null,
                  release_audience = 'katilanlar' where event_id = ${eventId}`;
      await sql`delete from contributions where film_id = ${filmId}`;
      await sql`delete from members where display_name = 'yolculuk üyesi'`;
    });
  });

  test('invitation to archive', async ({ browser }) => {
    test.setTimeout(120_000);
    // ── the admin invites a new member and adds them to the night ────────────
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, 'admin');
    await admin.goto('/masa/uyeler');
    await passSecondFactor(admin);
    await expect(admin).toHaveURL(/\/masa\/uyeler$/);
    await admin.getByLabel('ad', { exact: true }).fill('yolculuk üyesi');
    // "invite to the next night" is ticked by default on the member form
    await expect(admin.getByLabel(/için davet et/).first()).toBeChecked();
    await admin.getByRole('button', { name: 'üyeyi ekle ve davet kodu üret' }).click();
    const invite = (await admin.locator('code').first().textContent())!;
    expect(invite).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    await admin.goto(`/masa/geceler/${eventId}`);
    await expect(admin.getByRole('cell', { name: /yolculuk üyesi · henüz girmedi/ })).toBeVisible();

    // ── first entry with the one-time code, then a personal key ─────────────
    const memberCtx = await browser.newContext();
    const me = await memberCtx.newPage();
    await login(me, invite);
    await expect(me).toHaveURL(/\/hosgeldin$/);
    await me.getByRole('button', { name: 'anahtarımı oluştur' }).click();
    const key = (await me.locator('output').textContent())!;
    expect(key).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    await memberCtx.clearCookies();
    await login(me, key);
    await expect(me).toHaveURL(/\/oda$/);

    // ── önce: the pre-reading, marks, and the way to the night ───────────────
    await me.getByRole('link', { name: /ön okumaya geç/ }).click();
    await expect(me.getByRole('heading', { level: 1 })).toHaveText('canavar');
    const first = me.locator('article').first();
    await first.getByRole('button', { name: 'okudum' }).click();
    await expect(first.getByRole('button', { name: 'okudum ✓' })).toBeVisible();
    const second = me.locator('article').nth(1);
    await second.getByRole('button', { name: 'sonra oku' }).click();
    await expect(second.getByRole('button', { name: 'sonra oku ✓' })).toBeVisible();
    await expect(me.getByText('okuduğun: 1 /')).toBeVisible();

    // ── gece: RSVP, and the location stays closed ────────────────────────────
    await me
      .getByRole('navigation', { name: 'filmin belgeleri' })
      .getByRole('link', { name: 'gece' })
      .click();
    await expect(me).toHaveURL(/\/geceler\/2$/);
    await expect(me.getByText('27 eylül 2026 · pazar · 19.30')).toBeVisible();
    await me.getByText('geliyorum', { exact: true }).click();
    await me.getByRole('button', { name: 'kaydet' }).click();
    await expect(me.getByText('kaydedildi: geliyorum.')).toBeVisible();
    await admin.goto(`/masa/geceler/${eventId}`);
    await admin.getByLabel('gerçek konum').fill(PLACE);
    await admin.getByRole('button', { name: 'konum ayarlarını kaydet' }).click();
    await expect(admin.getByText('konum ayarları kaydedildi.')).toBeVisible();
    await me.reload();
    await expect(me.getByText('konum etkinlik günü davetlilere iletilecektir')).toBeVisible();
    expect(await me.content()).not.toContain(PLACE);
    expect(await (await me.request.get('/geceler/2/takvim')).text()).not.toContain(PLACE);

    // ── the admin releases it; the member sees it, the calendar carries it ───
    await admin.getByRole('button', { name: 'şimdi aç' }).click();
    await expect(admin.getByText(/açık · geliyorum diyenler/)).toBeVisible();
    await me.reload();
    await expect(me.getByText(PLACE)).toBeVisible();
    const ics = await (await me.request.get('/geceler/2/takvim')).text();
    expect(ics).toContain('LOCATION:');
    expect(ics).toContain('DTSTART:20260927T163000Z');

    // ── the night happened: the editor opens "sonra" by hand ─────────────────
    await me.goto('/filmler/002-canavar/sonra');
    await expect(
      me.getByText('sonrası, gece gerçekleştikten sonra editör tarafından açılır.'),
    ).toBeVisible();
    await admin.goto(`/masa/filmler/${filmId}`);
    const kunye = admin.getByRole('region', { name: 'künye' });
    await kunye.getByLabel('durum').selectOption('izlendi');
    await kunye.getByRole('button', { name: 'kaydet' }).click();
    await expect(kunye.getByText('kaydedildi.')).toBeVisible();
    await admin.getByRole('button', { name: 'sonrasını aç' }).click();
    await expect(admin.getByRole('button', { name: 'sonrasını kapat' })).toBeVisible();

    // ── sonra: a question, a contribution, a withdrawal ──────────────────────
    await db(
      (sql) => sql`insert into questions (film_id, layer, body, status)
                   values (${filmId}, 'sonra', 'Kimin gözünden baktık?', 'yayinda')`,
    );
    await me.reload();
    await expect(me.getByRole('heading', { name: 'masadan kalan sorular' })).toBeVisible();
    await me.getByText('düşünceni ekle').click();
    await me.getByLabel('düşüncen').fill('Üç bakış, tek bir gerçek değil.');
    await me.getByLabel('adsız').check();
    await me.getByRole('button', { name: 'ekle' }).click();
    await expect(me.getByText('Üç bakış, tek bir gerçek değil.')).toBeVisible();
    await expect(me.locator('li', { hasText: 'Üç bakış' }).getByText(/^adsız/)).toBeVisible();
    await me
      .locator('li', { hasText: 'Üç bakış' })
      .getByRole('button', { name: 'geri çek' })
      .click();
    await expect(me.getByText('Üç bakış, tek bir gerçek değil.')).toHaveCount(0);

    // ── arşiv: the film now lives in the archive with its three documents ────
    await me.goto('/filmler');
    const archive = me.locator('section[aria-labelledby="arsiv"]');
    await expect(archive.getByRole('link', { name: /canavar/ })).toBeVisible();
    await archive.getByRole('link', { name: /canavar/ }).click();
    await expect(me.getByRole('link', { name: /sonrasına geç/ })).toBeVisible();

    await db((sql) => sql`delete from questions where body = 'Kimin gözünden baktık?'`);
    await adminCtx.close();
    await memberCtx.close();
  });
});
