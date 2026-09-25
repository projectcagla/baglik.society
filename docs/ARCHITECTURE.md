# mimari ve güvenlik

## teknik seçim

| katman | seçim | neden |
| --- | --- | --- |
| web | Next.js 16 App Router, TypeScript strict, React 19 | Server Components ile özel veri hiçbir zaman istemci JS'ine yazılmıyor. Server Actions JS kapalıyken de çalışıyor. |
| stil | CSS Modules + `globals.css` token'ları | Az sayıda, markaya özgü bileşen. Utility sınıf gürültüsü yok, çalışma zamanı maliyeti yok. |
| veri | PostgreSQL 16 (Supabase Postgres, Neon ya da kendi sunucun) + `postgres` sürücüsü | RLS gerçek yetki sınırı. Düz SQL migrasyonları. ORM yok. |
| kimlik | kendi, küçük ve test edilmiş auth modülü (`src/server/auth`) | Brief'in istediği "tek alanlı, kişiye özel, tek kullanımlık kod" akışı Supabase Auth'ta yok. Aynı akışı Supabase üstünde kurmak, JWT imzalamak ve iki yetki sistemini senkron tutmak demekti. Bunun yerine Postgres'in kendi rol + RLS mekanizması kullanılıyor. Supabase'e taşınırken yalnızca bağlantı adresi değişir. |
| parola özeti | Argon2id (`@node-rs/argon2`, m = 19 MiB, t = 2) + HMAC pepper | OWASP 2024 önerisi. Veritabanı sızsa bile pepper olmadan tahmin denenemiyor. |
| ikinci doğrulama | TOTP (RFC 6238), Node `crypto` ile | Ek servis yok. Sır AES-256-GCM ile şifreli saklanıyor. |
| görseller | `next/og` (Satori) + `sharp` | Davetiye PNG/JPG çıktısı veriden üretiliyor. JPEG'i arka plan olarak gömme yok. |
| test | Vitest (birim + gerçek Postgres entegrasyon), Playwright (production build'e karşı), axe-core | |

## yetki modeli: iki katman

1. **Uygulama (DAL):** Her sayfa ve her server action kendi başına `requireMember / requireStaff / requireAdmin` çağırıyor. Layout kontrolüne güvenilmiyor (App Router'da layout ve page paralel çalışır).
2. **Veritabanı (RLS):** Üye isteklerindeki her sorgu şöyle bir transaction içinde çalışıyor:

   ```sql
   set local role baglik_app;                            -- BYPASSRLS yok, tablo sahibi değil
   select set_config('app.member_id', '<uuid>', true),   -- oturumdan, sunucuda doğrulanmış
          set_config('app.mfa', 'on|off', true);
   ```

   Politikalar rolü her seferinde `members` tablosundan okuyor. İptal edilen üye, sonraki sorgusunda anında hiçbir şey göremez. Uygulama kodunda bir hata olsa bile editör konumu okuyamaz, üye taslağı göremez.

   Yetkisiz bağlamda (`asSystem`) yalnızca `src/server/auth/**` ve `src/server/system/**` çalışabiliyor (giriş, oturum, rate limit, bağlantı denetimi, teslimat kaydı). Bu kural ESLint'le zorunlu (`eslint.config.mjs`). `private` şeması (kodlar, oturumlar, MFA sırları, deneme sayaçları) `baglik_app` rolüne hiç açılmıyor.

## route matrisi

| route | anonim | üye | editör | yönetici (+MFA) |
| --- | --- | --- | --- | --- |
| `/` kapı | ✓ | → `/oda` | → `/oda` | → `/oda` |
| `/kayip-anahtar` | ✓ | ✓ | ✓ | ✓ |
| `/oda`, `/filmler/**`, `/geceler`, `/defter`, `/profil`, `/hosgeldin` | 303 → `/` | ✓ (RLS süzülmüş) | ✓ + taslaklar | ✓ + taslaklar |
| `/filmler/[slug]/sonra` | 303 | yalnız "sonra" yayındaysa içerik | ✓ | ✓ |
| `/geceler/[no]`, `/takvim`, `/davetiye/**` | 303 | yalnız davetliyse, değilse 404 | davetliyse | ✓ |
| `/masa`, `/masa/filmler/**`, `/masa/kaynaklar/**`, `/masa/baglantilar` | 303 | 403 | ✓ | ✓ |
| `/masa/geceler/[id]`, `/masa/uyeler/**`, `/masa/kayit` | 303 | 403 | 403 (liste salt okunur) | MFA yoksa → `/masa/guvenlik` |
| `/api/cron/link-check` | Bearer `CRON_SECRET` yoksa 404 | | | |
| `/api/health` | `{"status":"ok"}` ya da 503 `unavailable`; ayrıntı yok | | | |
| `/kurulum` | yalnız `SETUP_TOKEN` tanımlı ve kurucu yokken; aksi hâlde kapıya döner | | | |

Anonim bir ziyaretçi var olan ve olmayan her özel adres için aynı 303 cevabını alır. URL tahmini hiçbir şey söylemez. Dönüş adresi, 10 dakikalık HTTP-only bir çerezde saklanır; sorgu parametresine yazılmaz. Giriş, MFA ve form eylemlerinden sonraki her dönüş adresi aynı `safeReturnPath` süzgecinden geçer (yalnız bilinen bölümler; `//`, `\`, `..`, şema ve satır sonu reddedilir).

Bu tablo `tests/e2e/authz-matrix.spec.ts` içinde gerçek HTTP ile sınanıyor: anonim, davetli üye, davetsiz üye, editör, kurucu (MFA'sız) ve oturumu açıkken iptal edilen üye; okuma, açık ve kapalı "sonra", taslak film, gece, `.ics`, davetiye görseli, Markdown dışa aktarım ve masa. Aynı testte taslak kaynak, yayımlanmamış "sonra" kaynağı, taslak film adı ve açılmamış konum için HTML'de **ve** RSC yükünde (`RSC: 1`) sızıntı aranıyor. MFA'lı yönetici hücreleri `location.test.ts` ve `admin.spec.ts` içinde.

## rol ve izin matrisi (veritabanında uygulanan)

| tablo / işlem | üye | editör | yönetici | yönetici + MFA | kurucu + MFA |
| --- | --- | --- | --- | --- | --- |
| films / resources / questions / screening_notes okuma | yayındakiler; "sonra" katmanı yalnız `after_published_at` doluysa | hepsi | hepsi | hepsi | hepsi |
| aynıları yazma | – | ✓ | ✓ | ✓ | ✓ |
| film silme | – | – | – | ✓ | ✓ |
| events okuma | davetli olduğu | hepsi | hepsi | hepsi | hepsi |
| events / davetliler yazma | – | – | – | ✓ | ✓ |
| event_private (gerçek konum, yönetici notu) | – (yalnız `app.event_location()`) | – | – | ✓ | ✓ |
| event_invitees | kendi satırı; yazma yalnız `app.set_rsvp()` | kendi | kendi | hepsi | hepsi |
| members | kendisi | kendisi | kendisi | hepsi | hepsi |
| yönetici/kurucu atamak | – | – | – | – | ✓ (tetikleyiciyle) |
| journal_entries | kendi notları + paylaşılanlar | aynı | aynı | + paylaşılanların moderasyonu (özel notlar **asla**) | aynı |
| contributions | "sonra" açıkken okuma/yazma, kendi katkısını geri çekme | aynı | aynı | + moderasyon | aynı |
| audit_logs, notification_deliveries | – | – | – | okuma | okuma |
| private.* (kodlar, oturumlar, MFA) | – | – | – | – | – (yalnız auth modülü) |

## editoryal kurallar (v1.1, veritabanında)

`db/migrations/0003_editorial.sql` ekleyici ve veriyi koruyan bir migrasyon. Elle geri alma adımları `db/rollback/0003_editorial.down.sql` dosyasında.

| kural | nerede | neden |
| --- | --- | --- |
| RSVP kapasitesi etkinlik satırı kilitlenerek denetlenir | `app.set_rsvp` (`select … for update`) | READ COMMITTED'da iki eşzamanlı "geliyorum" son koltuğu birlikte alabiliyordu |
| "üye gibi gör" üye yetkisiyle çalışır | `app.role()`, `app.preview = 'member'`; MFA da kapanır | önizleme JS/CSS süzmesi değil; veritabanı üyeye ne veriyorsa o |
| spoiler'lı kaynak "önce" katmanında yayımlanamaz | `resources_no_spoiler_before` (NOT VALID: eski satırlara dokunmaz, her yeni yazımı denetler) | CSS ile saklamak güvenlik değildir |
| "sonra" katmanı gösterim olmadan açılamaz | `films_after_guard` tetikleyicisi: film `izlendi/arsiv` ya da bağlı bir gece başlamış olmalı | başlangıç saati geçmesi yayın demek değil; açmak her zaman editörün kararı |
| katkı metni sonradan değiştirilemez | `revoke update (body) on contributions` | sessiz düzenleme yok; üye isterse geri çeker (karar: düzenleme yerine geri çekme) |
| üye kırık bağlantı bildirebilir | `app.report_link()`: yalnız görebildiği yayındaki kaynak, üye/kaynak başına günde bir | editör kuyruğuna düşer; analitik yok |
| kaynağın kökeni, gerekçesi, son insan onayı | `rationale`, `source_minutes`, `provenance`, `approved_at/by`, `review_note` | neyin nereden geldiği ve kimin doğruladığı kayıtta; editör notu üye yanıtından sunucuda çıkarılır |
| **dış bağlantılı kaynak, bir kişinin onayı olmadan yayımlanamaz** (0004) | `resources_publication_guard` tetikleyicisi: onay yalnız oturumdaki kişiyle (`approved_by` = o kişi; script/seed/bağlantı denetleyicisi onaylayamaz); URL ya da künye değişince onay düşer, yayındaki kaynak taslağa döner; 0004 öncesi yayında olanlar kaybolmaz, kuyrukta bekler | HTTP 200 bir insan kontrolü değildir; eski seed ya da doğrudan SQL de bu kuralı aşamaz |
| editör önerisi | `rationale_draft` (0004): yalnız masada görünür, üye yanıtından çıkarılır | yapay/taslak metin kimsenin kişisel görüşü gibi yayımlanmaz |

Yayın öncesi denetim (`src/lib/publish-check.ts`): başlık, tek ve açık bir http(s) bağlantı, hak durumu, özgün özet seçiliyse Türkçe not, önce katmanının temel kaynakları için "neden bu kaynak", açıkça seçilmiş spoiler düzeyi, spoiler'a uygun katman ve insan onayı. Yayımlama satırı kilitleyerek denetler; yayındaki bir kaynak düzenlemeyle yayımlanamaz hâle getirilemez. Migrasyon geri dönüşleri: `db/rollback/0004_release.down.sql`, ardından `0003_editorial.down.sql` (`tests/integration/migrations.test.ts` v1 verisinden yükseltmeyi ve ikisini de sınar). Aynı işlev masada listeyi çiziyor ve sunucuda yayımı reddediyor. Künye ya da bağlantı değişince insan onayı kendiliğinden düşer.

Moderasyon geri alınabilir: kaldırılan katkı "geri aç", gizlenen paylaşılmış not "geri aç" ile döner, her adım `audit_logs`'ta (`contribution.moderate`, `journal.moderate`). Geri çekilen ya da kaldırılan katkının metni üyelere sunucudan hiç gönderilmez. Yalnız MFA'lı yönetici, geri açabilmek için kaldırılanı görür.

## veri modeli (özet)

`members` · `private.credentials` (selector + Argon2id verifier; tür: `key` / `invite` / `recovery`) · `private.sessions` (SHA-256 token özeti) · `private.auth_attempts` · `private.member_mfa` · `films` · `resources` (kaynak kaydı: künye, özgün URL, Türkçe özgün not, spoiler, hak durumu, bağlantı sağlığı) · `link_checks` · `questions` · `screening_notes` · `events` · `event_films` · `event_private` · `event_invitees` (RSVP dahil) · `journal_entries` · `contributions` (en fazla 3 düzey) · `resource_marks` · `notification_deliveries` · `audit_logs`. Ayrıntı: `db/migrations/0001_init.sql`.

## gizli konum: açılma kuralı

`app.event_location(event_id)` bir `security definer` fonksiyonu. Konumu bir üyeye ulaştırmanın tek yolu bu:

```
davetli değil (veya aktif üye değil)          → 'yok'
etkinlik iptal                                 → 'iptal'
coalesce(released_at, release_at) yok / gelecek → 'gizli'           (davetli genel metni görür)
kitle 'katilanlar' ve üye "geliyorum" demedi   → 'katilim_gerekli'
konum metni boş                               → 'paylasilmadi'    ("konum bilgisi henüz paylaşılmadı")
aksi halde                                    → 'acik' + konum
```

Sayfa, takvim dosyası (`.ics`) ve bildirim e-postası aynı fonksiyonu kullanıyor. Açılış zamanı gelmeden konum HTML'de, RSC payload'unda, ICS dosyasında, logda ya da denetim kaydında yer almıyor. Davetiye görsellerine konum hiç yazılmıyor. Editör ve MFA'sız yönetici tabloyu okuyamıyor. Bu kurallar `tests/integration/location.test.ts` ve `tests/e2e/location-leak.spec.ts` ile doğrulanıyor. Politika bilerek bozulduğunda bu testlerin kırıldığı da denendi.

## kodlar ve oturumlar

- Kod biçimi `XXXX-XXXX-XXXX-XXXX` (Crockford base32). İlk 4 karakter gizli olmayan bir seçici, kalan 12 karakter (60 bit) gizli doğrulayıcı. Doğrulayıcı `HMAC(pepper) → Argon2id` olarak saklanıyor. Kapı tek alan: yazılan kod ne tür olursa olsun aynı alana giriyor.
- **Davet kodu:** tek kullanımlık, 14 gün geçerli. Yönetici bir kez görür ve özel kanaldan iletir. İlk girişte üye `aktif` olur, `/hosgeldin` sayfasında kişisel anahtarını oluşturur (anahtar yalnızca o an gösterilir; parola yöneticisi kaydedebilsin diye form alanlarıyla).
- **Kişisel anahtar:** kalıcıdır. Üye profilinden yenileyebilir; yenisi oluşunca eskisi anında geçersiz olur.
- **Kurtarma kodu:** e-postayla, 30 dakika, tek kullanımlık. Cevap her durumda aynı cümledir (üye var mı yok mu belli olmaz). E-posta sağlayıcısı yoksa hiçbir şey "gönderildi" diye işaretlenmez; teslimat `saglayici_yok` olarak kaydedilir ve yönetici yeni davet kodu verir.
- **Hata cevabı tek:** bilinmeyen, yanlış, süresi dolmuş, kullanılmış, iptal edilmiş ve kilitli kodların hepsi "kod geçerli değil." cevabını alır ve hepsinde aynı Argon2 işi yapılır.
- **Rate limit (Postgres'te):** IP başına 15 dakikada 10 hata; seçici başına saatte 8 hata (kod kilitlenir); genel olarak 10 dakikada 300 hata; MFA için 15 dakikada 5 hata; kurtarma için IP başına saatte 5, e-posta başına günde 3. IP'ler yalnızca pepper'lı özet olarak tutulur ve 2 gün sonra silinir.
- **Oturum:** 256 bit rastgele token. Çerez `__Host-bs_session`, HttpOnly, Secure, SameSite=Lax. Veritabanında yalnızca SHA-256 özeti durur. 30 gün kullanılmazsa, en geç 180 günde düşer. Girişte önceki oturum iptal edilir (session fixation). Çıkış, üyelik iptali ve "tüm oturumları kapat" sunucu tarafında etkilidir.
- **Yönetici ikinci doğrulaması:** TOTP ile. Bir oturumda 12 saat geçerli. Tekrar kullanılan kod reddedilir. `app.mfa` ayarı RLS'e de geçer; konum, üyeler ve davetler MFA olmadan veritabanından da okunamaz.

## tehdit modeli

| risk | önlem | kanıt |
| --- | --- | --- |
| kod tahmini / brute force | 60 bit doğrulayıcı, Argon2id, IP + seçici + genel limit | `auth.test.ts` (throttle, selector lock) |
| kullanıcı sayımı (enumeration) | tek hata cümlesi, sabit iş, kurtarmada aynı cevap | `auth.test.ts`, `public.spec.ts` |
| URL tahmini / link önizleme | proxy'de her özel yol için aynı 303; nötr `<title>`, `og:image` yok, `noindex` + `X-Robots-Tag` | `public.spec.ts` |
| IDOR / BOLA | RLS, id'ler tahmin edilemez uuid, DAL her sorguda üyeyi bağlar | `rls.test.ts` |
| konum sızıntısı | `app.event_location`, `event_private` yalnız admin+MFA, ICS ve e-posta aynı kurala bağlı, denetim kaydına adres yazılmaz | `location.test.ts`, `location-leak.spec.ts` |
| spoiler sızıntısı | "sonra" katmanı RLS'te `after_published_at` şartına bağlı; CSS ile gizleme yok | `rls.test.ts` |
| XSS | React escaping; editoryal metin HTML'e hiç çevrilmeden React öğelerine dönüşüyor; yalnız http(s) bağlantı; nonce'lu katı CSP | `richtext.test.ts` |
| CSRF | Server Actions Origin/Host kontrolü, SameSite=Lax çerez, GET'ler yan etkisiz | JS'siz form testi (`public.spec.ts`) |
| session fixation | girişte yeni token, eski oturum iptal | |
| public cache poisoning | tüm dinamik yanıtlar `private, no-store`; özel görseller ve ICS route handler'dan `no-store` ile | `public.spec.ts` başlıkları |
| özel medya sızıntısı | davetiye görselleri istek anında, oturum ve davet kontrolüyle üretiliyor; `public/` altında yalnızca logo var | `member.spec.ts` |
| harici video izleme | gömülü video yok, yalnız dış bağlantı (`noopener noreferrer`) | |
| referrer sızıntısı | `Referrer-Policy: same-origin`, dış bağlantılarda `noreferrer` | |
| e-posta sırrı sızıntısı | konum e-postaya yalnız yönetici açıkça işaretlerse girer; kurtarma e-postasında film/gece bilgisi yok | |
| SSRF (editörün girdiği kaynak URL'si sunucudan çağrılıyor) | yalnız http(s) ve 80/443, kimlik bilgili URL yok; adresi **soketin kendisi** denetliyor (Node `lookup` kancası), yani denetlenen adres bağlanılan adres: DNS rebinding / TOCTOU yok. Özel, loopback, link-local, CGNAT, çoklu yayın, belgeleme aralıkları ve IPv6 içine gömülü IPv4 (`::ffff:`, `::a.b.c.d`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`) reddediliyor. Onluk/onaltılık/kısaltılmış IPv4 yazımları URL ayrıştırıcıda normalleşip aynı denetime giriyor. Yönlendirmeler elle, en çok 5 adım ve her adımda yeniden denetimle izleniyor | `ssrf.test.ts` (gerçek yerel sunucuya hiç istek gitmediği dahil) |
| RSVP yarışı (son koltuk) | etkinlik satırı kilidi, aynı cevabı tekrarlamak idempotent | `rsvp-concurrency.test.ts`: düzeltmeden önce başarısızdı |
| önizlemeden taslak sızması | önizleme veritabanında üye yetkisiyle; HTML ve RSC yükünde taslak aranıyor | `editorial.test.ts`, `authz-matrix.spec.ts` |
| açık yönlendirme | tüm dönüş adresleri `safeReturnPath` ile | `return-path.test.ts` |
| webhook / cron | `CRON_SECRET` zamanlama güvenli karşılaştırma, yanlışsa 404 | `public.spec.ts` |
| clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | |
| yönetici hesabı ele geçirme | TOTP, 12 saatlik tazelik, DB tarafında MFA şartı, kurucu dışında kimse yönetici atayamaz | `rls.test.ts`, `admin.spec.ts` |

Kapsam dışı: sağlayıcı (Vercel/Supabase) personeli ya da veritabanına doğrudan erişimi olan biri özel notları okuyabilir. Notlar uçtan uca şifreli değil ve uygulama bunu arayüzde açıkça söylüyor.

Bağlantı denetimi barındırma ortamı hakkında bir varsayım yapıyor: sunucunun giden bağlantıları Node'un kendi soketleriyle ve bu kancadan geçerek kuruluyor. Ortam kendi çıkış vekilini zorunlu kılıyorsa (ör. kurumsal proxy) denetim o vekilin arkasındaki adresi göremez. O durumda `LINK_CHECK=off` ile denetim tümden kapatılır (haftalık cron da masadaki "bağlantıyı denetle" düğmesi de ağa hiç çıkmaz; bağlantılar "denetlenmedi" kalır ve üye bildirimleri kuyruğa düşmeye devam eder) ya da yalnız dış ağa çıkan, iç ağa kapalı bir çıkış vekili kullanılır.

## depo ve yayın stratejisi

Depo şu an herkese açık (GitHub, 25 Eylül 2026'da denetlendi). Görünürlük bu çalışmada değiştirilmedi. Depoda olanlar ve olmayanlar:

- **Hiçbir zaman yok:** gerçek konum, üye adı / e-postası, giriş kodu, anahtar, pepper, TOTP sırrı, `.env`. Konum yalnız yönetici tarafından üretim veritabanına girilir. Testler ve ekran görüntüleri yalnız `example.test` adresli deneme hesaplarını kullanır.
- **Var:** marka dosyaları, iki filmin programı (001, 002), 2. gecenin tarihi ve saati (davetiyede de yazıyor), küratörün iki PDF'ten aktarılan Türkçe notları ve kaynak listesi (`db/seed/content.ts`).

Seçenekler (karar kulübün):

1. **Depoyu özel yapmak** (önerilen, en basit). Kod, testler ve CI olduğu gibi çalışır. Geçmişteki commit'ler de özel olur.
2. **Açık kalıp içeriği ayırmak.** Seed içeriği depo dışındaki özel bir JSON'dan okunur, testler sentetik içerikle çalışır. Ancak şimdiye kadarki commit geçmişi içeriği zaten taşıyor. Tam ayrım için geçmişin yeniden yazılması gerekir; bu, sahibinin onayı olmadan yapılmaz.
3. **Bilerek açık bırakmak.** Programın ve notların zaten davetiyeyle paylaşıldığı kabul edilir. Gelecek gecelerin tarihleri ve yeni editoryal metinler depoya değil, yalnız masadan üretim veritabanına girilir. Seed bir kez çalıştıktan sonra içerik masada yaşar.

## KVKK odaklı hijyen

- Toplanan veri: ad, isteğe bağlı e-posta, davet/katılım, kendi notları, okuma işaretleri. IP adresi saklanmıyor, yalnızca pepper'lı özeti 2 gün tutuluyor. Tarayıcı bilgisi olarak yalnızca kaba bir etiket ("iPhone · Safari") kaydediliyor.
- Üye kendi kayıtlarını `/profil/veri` üzerinden JSON olarak indirebiliyor. Yönetici, silme talebinde üyeyi kalıcı olarak silebiliyor (notlar, katılım ve oturumlar da silinir).
- Bu belge hukuki metin değildir ve KVKK uyumu iddia etmez. Aydınlatma metni, açık rıza gereken durumlar ve saklama süreleri **hukuk danışmanı incelemesi gereken ayrı bir iş** olarak açık duruyor.
