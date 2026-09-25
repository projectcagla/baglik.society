# üretim el kitabı (production runbook)

bağlık.society'yi yayına almak, işletmek ve bir şey ters gittiğinde geri almak için adım adım yol. Değer değil yalnız **adlar** yazılıdır: gizli değerler hiçbir zaman bu depoya, bir PR'a, sohbete ya da ekran görüntüsüne girmez.

Mimari: Next.js 16 (Node çalışma zamanı) + PostgreSQL 16 (RLS). Önerilen barındırma: **Vercel** (uygulama, Frankfurt `fra1`) + **Neon** (veritabanı, Frankfurt `eu-central-1`). İkisinin de ücretsiz planı bu kulübün ölçeğine yeter. Başka bir barındırmada da çalışır: Node 22, TLS ve `x-real-ip` başlığı yazan bir reverse proxy yeterli (bkz. README "yayına alma").

---

## 0. sahibinin vereceği kararlar (bir kez)

| karar                | seçenekler                                                                                                                                                                         | etkisi                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| depo görünürlüğü     | **A)** depoyu özel yap (önerilen) · **B)** açık kalsın; gelecek program ve notlar yalnız masadan üretim veritabanına girilsin                                                       | açık depoda iki filmin programı, 2. gecenin tarihi ve PDF'lerden gelen notlar görünür; geçmiş commit'ler de öyle |
| adres                | **şimdilik** `…vercel.app` (HTTPS hazır, alan adı gerekmez) · sonra kendi alan adın                                                                                                | `APP_ORIGIN` bu adrese göre yazılır; kendi alan adına geçişte yalnız o değişir                                     |
| konum iletimi        | e-posta sağlayıcı **yok** (varsayılan): konumu gece günü davetlilere sen iletirsin · ya da Resend hesabı                                                                           | sağlayıcı yoksa uygulama hiçbir zaman "gönderildi" demez                                                          |
| sorumlu kişi         | gece günü konumu açacak ve üye sorularını karşılayacak yönetici (MFA'lı)                                                                                                            | —                                                                                                                 |

---

## 1. ortamlar

| ortam            | nerede                                          | veritabanı                           | veri                         |
| ---------------- | ----------------------------------------------- | ------------------------------------ | ---------------------------- |
| local            | geliştirici makinesi                            | yerel postgres                       | sentetik                     |
| staging          | Vercel **Preview** (ör. `staging` dalı)         | **ayrı** Neon veritabanı ya da dalı  | yalnız sentetik hesaplar     |
| production       | Vercel **Production** (`main` dalı)             | **ayrı** Neon veritabanı             | gerçek üyeler                |

Her ortamın kendi veritabanı ve kendi gizli değer seti olur. Staging'e üretim verisi kopyalanmaz.

---

## 2. ortam değişkenleri (adlar; kaynak: `src/server/env.ts`, `.env.example`)

| ad                                  | zorunlu      | nereden                                                   | not                                                                                                                                               |
| ----------------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | evet         | Neon entegrasyonu (havuzlu bağlantı)                      | uygulama bununla bağlanır                                                                                                                         |
| `DATABASE_URL_UNPOOLED`             | önerilir     | Neon entegrasyonu (doğrudan bağlantı)                     | migrasyon ve seed bununla çalışır (`scripts/lib/db.ts`)                                                                                           |
| `DB_PREPARE`                        | havuzlu ise  | elle: `false`                                             | havuz (pgbouncer) ile hazır ifadeleri kapatır                                                                                                     |
| `AUTH_PEPPER`                       | evet         | elle: `openssl rand -base64 32`                           | **değiştirilirse bütün kodlar ve anahtarlar geçersiz olur.** güvenli yere yedekle                                                                  |
| `APP_ENCRYPTION_KEY`                | evet         | elle: `openssl rand -base64 32`                           | TOTP sırlarını şifreler; **değiştirilirse ikinci doğrulamalar yeniden kurulmalı**                                                                  |
| `APP_ORIGIN`                        | evet         | elle: `https://…` (son eğik çizgi yok)                    | takvim dosyası ve e-posta bağlantıları                                                                                                            |
| `CRON_SECRET`                       | evet         | elle: `openssl rand -hex 24`                              | Vercel haftalık bağlantı denetimine kendisi ekler                                                                                                  |
| `SETUP_TOKEN`                       | ilk kurulum  | elle: `openssl rand -hex 24`                              | yalnız ilk kurucuyu `/kurulum`'dan oluşturmak için; kurucu oluşunca **sil**                                                                        |
| `LINK_CHECK`                        | hayır        | `on` (varsayılan) · `off`                                 | Vercel'de `on` güvenli (soket düzeyinde adres denetimi). zorunlu çıkış vekili olan barındırmada `off`                                              |
| `RESEND_API_KEY`, `MAIL_FROM`       | hayır        | Resend hesabı                                             | yoksa: kayıp kod sayfası ve konum bildirimi dürüstçe "e-posta açık değil" der                                                                     |

Staging ve production için **ayrı** `AUTH_PEPPER`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `SETUP_TOKEN` üret.

---

## 3. ilk kurulum (önce staging, sonra production)

1. **Vercel:** Add New → Project → GitHub'dan `projectcagla/baglik.society`'yi içe aktar. Framework: Next.js. Build komutu `vercel.json`'dan gelir (`npm run vercel-build` = migrasyon → seed → build). Bölge `fra1`.
2. **Neon:** Vercel projesinde Storage → Neon ile bir Postgres oluştur (bölge: Frankfurt) ve projeye bağla. Entegrasyon `DATABASE_URL` ve `DATABASE_URL_UNPOOLED` değişkenlerini ekler. Staging (Preview) ve Production'ın **farklı** veritabanlarına bağlandığını panelden doğrula.
3. **Gizli değerler:** Vercel → Settings → Environment Variables. Bölüm 2'deki adları ilgili ortam(lar) için ekle. Değerleri kendi makinende üret ve doğrudan panele yapıştır.
4. **Dağıt.** Build günlüğünde şunları gör: `applied 0001…0004`, `film 002-canavar: 7 draft sources`, `event 2 … location not set`.
5. **Kurucu:** `https://<adres>/kurulum` → `SETUP_TOKEN` + adın → tek kullanımlık kod **bir kez** görünür → kapıya gir → kişisel anahtarını oluştur (bir yere yaz) → masa → güvenlik → doğrulama uygulamasıyla ikinci doğrulamayı kur.
6. `SETUP_TOKEN`'ı Vercel'den **sil** ve yeniden dağıt. (Kurucu oluştuğu an `/kurulum` zaten kapanır; silmek ikinci kilittir.)
7. **Anonim smoke test:** `npm run smoke -- https://<adres>` (20 kontrol; hepsi ✓ olmalı). Terminal yoksa: GitHub → Actions → staging-acceptance (yalnız staging).
8. **Staging kabul testi (yalnız staging):** GitHub → Settings → Environments → `staging` → secret `STAGING_SETUP_TOKEN` (staging'in `SETUP_TOKEN` değeri). Staging **yeni ve boşken** Actions → staging-acceptance → Run workflow → staging adresi. İş akışı sentetik kurucu, editör, üye ve davetsiz hesap oluşturur; 13 kabul adımını koşar ve ekran görüntülerini 7 gün saklar. Önizlemeler Vercel korumalıysa `VERCEL_AUTOMATION_BYPASS_SECRET` secret'ını da ekle. **Production'da çalıştırma**: kurulumu tüketir.

---

## 4. pazar gecesinden önce (editör + yönetici, ~30 dk)

1. **Canavar kaynakları (≈15 dk):** masa → özet → editör kuyruğu. Her Canavar kaynağında sırasıyla:
   - özgün bağlantıyı aç; başlık, yazar, yayın ve yılı sayfanın kendisiyle karşılaştır (bkz. `docs/RELEASE_2026-09.md` → editoryal QA);
   - "neden bu kaynak" alanını kendi sözlerinle yaz ya da **öneriyi alana taşı** ve düzelt (öneri senin görüşün değildir);
   - kaydet → **künyeyi ve bağlantıyı kontrol ettim** → **yayımla**;
   - "üye gibi gör" ile okuma sayfasına bak.
2. **Üyeler:** masa → üyeler → her üye için "üyeyi ekle ve davet kodu üret". "sıradaki gece için davet et" işaretlidir. Kod yalnız bir kez görünür; kişiye **özel kanaldan** ilet. Toplu ekleme için aynı sayfada "ad, e-posta" satırları kullanılabilir.
3. **Gece:** masa → geceler → canavar. Tarih `27 eylül 2026 · pazar · 19.30` (İstanbul) olmalı. Genel konum cümlesi: `konum etkinlik günü davetlilere iletilecektir`.
4. **Konum (gece günü):** aynı sayfada "gerçek konum" alanına adresi yaz, "kimler görür"ü seç (varsayılan: geliyorum diyenler), açılış zamanını ver ya da "şimdi aç" de. E-posta sağlayıcı yoksa konumu davetlilere **kendin** ilet. Konum açıldıktan sonra takvim dosyasını daha önce indirenlerin **yeniden indirmesi** gerekir.

---

## 5. yedek ve geri yükleme

- **Migrasyondan önce elle yedek:** `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f baglik-$(date +%F).dump`. Yedek dosyası kişisel veri içerir: şifreli bir yerde tut, depoya koyma.
- **Geri yükleme (boş veritabanına):** `pg_restore --no-owner -d "<hedef>" baglik-….dump`. Ardından `npm run db:migrate` eksik migrasyon olmadığını doğrular.
- **Neon:** panelden geri alma (restore) / dal (branch) oluşturma. Geçmişe dönüş süresi plana göre değişir; üretime geçmeden önce panelden doğrula.
- **Deneme:** `tests/integration/migrations.test.ts` v1 verisinden yükseltmeyi ve geri dönüşleri boş veritabanlarında sınar.

## 6. dağıtım, geri alma

- `main`'e birleşen her commit Production'a dağıtılır; build sırasında yeni migrasyonlar uygulanır. Migrasyonlar ekleyicidir ve tek tek transaction içinde çalışır; hata olursa dağıtım canlıya çıkmaz.
- **Uygulamayı geri al:** Vercel → Deployments → bir önceki başarılı dağıtım → Promote / Instant Rollback. Veritabanı şeması ileri uyumludur; eski kod yeni sütunları kullanmaz.
- **Şemayı geri al (son çare, önce yedek):** `db/rollback/0004_release.down.sql`, sonra gerekirse `db/rollback/0003_editorial.down.sql`. Hangi verinin silindiği dosyaların başında yazılıdır. `rationale_draft` önerileri ve 0003 alanları kaybolur.

## 7. izleme ve kayıtlar

- **Sağlık:** `GET /api/health` → `{"status":"ok"}` (200) ya da `{"status":"unavailable"}` (503). İçinde hata metni, sürüm ya da adres yok. İsteğe bağlı olarak ücretsiz bir uptime servisiyle 5 dakikada bir izlenebilir.
- **Kayıtlar:** Vercel → Logs. Uygulama kod, anahtar, konum ya da not içeriği yazmaz; beklenmedik masa hatalarında yalnız veritabanının hata başlığı düşer (`[desk] …`). Masa → kayıt, yönetici işlemlerinin denetim kaydıdır (MFA'lı yönetici görür).
- **Bağlantı denetimi:** her pazartesi 04.17 UTC (`vercel.json`). Sonuçlar masa → bağlantılar. HTTP 200 **insan onayı değildir**.

## 8. arıza senaryoları

| durum                                   | belirti                                         | ne yapılır                                                                                                          |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| veritabanı erişilemiyor                 | sağlık 503, sayfalarda "bir şey ters gitti"     | Neon durum sayfası; bağlantı dizesi değişti mi; gerekirse bir önceki dağıtıma dön                                   |
| üye kodunu kaybetti                     | kapı "kod geçerli değil"                        | masa → üyeler → "yeni davet kodu üret" → özel kanaldan ilet (e-posta yoksa kurtarma sayfası bunu söyler)           |
| yönetici telefonunu kaybetti (MFA)      | masa → güvenlik kodu kabul etmiyor              | başka bir kurucu (MFA'lı) masa → üyeler → kişi → "ikinci doğrulamayı sıfırla"; tek kurucu varsa: `npm run mfa:reset` (üretim `DATABASE_URL` ile, bir terminalden) |
| konum yanlış kişiye açıldı şüphesi      | —                                               | masa → gece → "paylaşımı geri çek"; kimlerin gördüğü RLS kuralıyla sınırlıdır (bkz. ARCHITECTURE)                  |
| kaynak bağlantısı kırıldı               | kuyrukta "üye bildirdi" / "bağlantı kırık"      | bağlantıyı düzelt: onay düşer ve kaynak taslağa döner; yeniden kontrol et, yayımla                                  |
| e-posta sağlayıcı yok                   | "e-posta gönderimi açık değil"                  | tasarım gereği; kodları ve konumu elle ilet                                                                         |

## 9. kendi alan adına geçiş (sonra)

Vercel → Settings → Domains → alan adını ekle ve DNS kayıtlarını panelde gösterildiği gibi gir. Türkçe karakterli bir alan adı (IDN) DNS'te punycode (`xn--…`) olarak görünür; `APP_ORIGIN`'e tarayıcının gösterdiği `https://` adresini yaz. HTTPS zorunludur (`__Host-` çerezi ve HSTS). Eski `vercel.app` adresi aynı uygulamaya gider; üyelere tek adres ver.

## 10. canlıya çıktıktan hemen sonra (smoke)

1. `npm run smoke -- https://<production>`: 20 ✓, kurulum **kapalı**.
2. Kurucu: giriş → masa (MFA) → kuyruk → gece sayfası; konum alanı boş.
3. Bir test davetlisi (gerçek olmayan ad): davet kodu → kişisel anahtar → oda → ön okuma → katılım. Takvimde konum yok.
4. Davetsiz bir test hesabı: `/geceler/2` → bulunamadı.
5. Test hesaplarını masa → üyeler'den **kalıcı olarak sil**.
6. Başlıklar: `X-Robots-Tag: noindex`, `Cache-Control: private, no-store`, HSTS (smoke betiği denetler).
