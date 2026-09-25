// Anonymous smoke test of a deployment — no account, no secret needed.
//   npm run smoke -- https://ornek.vercel.app
// Checks what a stranger can see (nothing), the security headers, the health
// signal and whether first-owner setup is still open. Exit code 1 on failure.
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('usage: npm run smoke -- https://your-deployment');
  process.exit(2);
}

const PRIVATE = [
  /canavar/i,
  /kore-?eda/i,
  /drive my car/i,
  /hamaguchi/i,
  /27 eylül/i,
  /2026-09-27/,
];
const results: { check: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ check: name, ok, note });

// Vercel "Protection Bypass for Automation", when previews are protected
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

async function get(path: string, init: RequestInit = {}) {
  return fetch(base + path, {
    redirect: 'manual',
    ...init,
    headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {},
  });
}

async function main() {
  const door = await get('/');
  const html = await door.text();
  check('kapı 200', door.status === 200, String(door.status));
  check('noindex', (door.headers.get('x-robots-tag') ?? '').includes('noindex'));
  check('CSP (nonce)', /nonce-/.test(door.headers.get('content-security-policy') ?? ''));
  check('no-store', (door.headers.get('cache-control') ?? '').includes('no-store'));
  check('kapıda özel içerik yok', !PRIVATE.some((re) => re.test(html)));
  check('og:image yok', !/og:image|twitter:image/.test(html));
  if (base.startsWith('https://'))
    check('HSTS', (door.headers.get('strict-transport-security') ?? '').includes('max-age'));

  for (const path of ['/oda', '/filmler/002-canavar/okuma', '/geceler/2', '/masa', '/yok-boyle']) {
    for (const method of ['GET', 'HEAD']) {
      const r = await get(path, { method });
      const to = r.headers.get('location') ?? '';
      check(
        `${method} ${path} → kapı`,
        r.status === 303 && new URL(to, base).pathname === '/',
        `${r.status} ${to}`,
      );
    }
  }

  const health = await get('/api/health');
  const body = await health.text();
  check(
    'sağlık 200 {"status":"ok"}',
    health.status === 200 && body.includes('"ok"'),
    `${health.status} ${body}`,
  );

  const robots = await (await get('/robots.txt')).text();
  check('robots.txt her şeyi kapatıyor', /Disallow:\s*\/\s*$/m.test(robots));

  const cron = await get('/api/cron/link-check');
  check('cron sırsız 404', cron.status === 404, String(cron.status));

  const setup = await get('/kurulum');
  const setupOpen = setup.status === 200;
  results.push({
    check: 'kurulum sayfası',
    ok: true,
    note: setupOpen ? 'AÇIK — kurucu oluşturulunca kapanır; SETUP_TOKEN’ı sonra sil' : 'kapalı',
  });

  const width = Math.max(...results.map((r) => r.check.length));
  for (const r of results)
    console.log(`${r.ok ? '✓' : '✗'} ${r.check.padEnd(width)}  ${r.note ?? ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} kontrol başarısız.` : `\n${results.length} kontrol geçti.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
