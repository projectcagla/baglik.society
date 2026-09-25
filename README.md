# bağlık.society

Davetle girilen küçük bir sinema topluluğunun dijital mekânı. Dışarıdan bakan yalnızca bir kapı görür; içeride sıradaki gece, ön okumalar, film arşivi, gecelerin "sonrası", kişisel defter ve bir editör masası vardır.

- Tasarım, bilgi mimarisi, kompozisyon kararları: [`docs/DESIGN.md`](docs/DESIGN.md)
- Mimari, rol matrisi, konum kuralı, tehdit modeli: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Marka varlıkları ve master'a sadakat: [`docs/brand/ASSET_MANIFEST.md`](docs/brand/ASSET_MANIFEST.md)

Yığın: Next.js 16 (App Router, TypeScript strict), PostgreSQL 16 + satır düzeyi güvenlik, CSS Modules, Argon2id, TOTP, Vitest, Playwright.

## yerelde çalıştırma

Gereken: Node 22+, PostgreSQL 16 (yerel ya da Docker).

```bash
npm ci

# 1) veritabanı (örnek: yerel postgres; kullanıcı CREATEROLE yetkisine sahip olmalı)
createuser --createrole --createdb -P baglik          # parola sor
createdb -O baglik baglik
createdb -O baglik baglik_test                        # testler için
createdb -O baglik baglik_e2e                         # e2e için

# 2) ortam değişkenleri
cp .env.example .env.local
# DATABASE_URL'i doldur, AUTH_PEPPER ve APP_ENCRYPTION_KEY için:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3) şema + iki gerçek film + 2. film gecesi
npm run db:migrate
npm run db:seed

# 4) ilk kurucu hesabı (tek kullanımlık davet kodunu terminalde bir kez gösterir)
npm run owner:create -- --name "Ad Soyad" --email ad@alan.com

npm run dev          # http://localhost:3000 → kodu kapıya yaz
```

İlk girişte `/hosgeldin` açılır ve kişisel anahtarını oluşturursun. Masaya ilk girişte TOTP kurulumu istenir; üyeler, davetler ve konum için gerekli.

Yalnızca geliştirme için: `npm run db:seed:demo` açıkça "deneme" diye etiketlenmiş dört kullanıcı ekler ve anahtarlarını basar. Production'da çalışmayı reddeder.

## komutlar

| komut | ne yapar |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `typecheck` · `format:check` | ESLint (güvenlik sınırı kuralı dahil), `next typegen && tsc`, Prettier |
| `npm test` | birim + entegrasyon testleri. `baglik_test` veritabanını her çalışmada migrasyon ve seed'den yeniden kurar |
| `npm run test:e2e` | Playwright: production build + `baglik_e2e`; ekran görüntüleri `artifacts/screenshots/` |
| `npm run db:migrate` · `db:seed` | SQL migrasyonları (checksum'lı) · idempotent seed (var olanı ezmez) |
| `npm run owner:create -- --name … --email …` | kurucu + tek kullanımlık davet kodu |
| `npm run invite:issue -- --email …` | mevcut üyeye yeni davet kodu (e-posta sağlayıcısı yoksa kurtarma yolu) |
| `npm run mfa:reset -- --email …` | kurucu doğrulama uygulamasını kaybettiyse (veritabanı erişimi gerekir) |
| `npm run links:check` | kaynak bağlantılarını denetler (cron ile aynı kod) |
| `npm run brand:derive` | marka türevlerini master'dan yeniden üretir |

## yayına alma (Vercel + Supabase ya da Neon)

1. **Veritabanı:** Supabase (ya da Neon) projesi aç. Bağlantı adresi:
   - Supabase: *Connect → Transaction pooler* (port 6543). `DB_PREPARE=false` kalsın.
   - Migrasyonu ilk kez **direct connection** (5432) adresiyle çalıştırmak daha güvenli: `DATABASE_URL=<direct> npm run db:migrate && npm run db:seed`.
   - Migrasyon, kısıtlı `baglik_app` rolünü oluşturur ve bağlanan kullanıcıya `SET ROLE` yetkisi verir. Supabase'in `postgres` kullanıcısı bunu yapabilir.
2. **Vercel:** repoyu içe aktar, ortam değişkenlerini gir (`.env.example`):
   `DATABASE_URL` (pooler), `DB_PREPARE=false`, `AUTH_PEPPER`, `APP_ENCRYPTION_KEY`, `APP_ORIGIN=https://alan-adin`, `CRON_SECRET`. İsteğe bağlı olarak e-posta için `RESEND_API_KEY` ve `MAIL_FROM`.
   `AUTH_PEPPER` ve `APP_ENCRYPTION_KEY` değiştirilirse mevcut kodlar ve TOTP sırları geçersiz olur. Güvenli bir yerde yedekle.
3. `vercel.json` haftalık bağlantı denetimini (`/api/cron/link-check`) tanımlar. Vercel `CRON_SECRET`'ı otomatik gönderir.
4. Kurucuyu oluştur: yerelde production `DATABASE_URL` ile `npm run owner:create -- --name … --email …`.
5. Alan adında HTTPS zorunlu. `__Host-` çerezi ve HSTS buna dayanıyor.

Kendi sunucunda: `npm ci && npm run build && npm start`, önünde TLS sonlandıran bir reverse proxy olmalı ve `x-real-ip` başlığını yazmalı (rate limit bunu kullanır).

## gündelik kullanım (masa)

- **Film:** `masa → filmler → yeni film` ile taslak oluşur. Künyeyi doldur, kaynak ekle, "yayımla" de. "Sonra" katmanını gösterimden sonra elle aç; gece başlamadan (ya da film "izlendi" olmadan) veritabanı açmaz.
- **Yeni kaynak (10–15 dk):** dört kısa bölüm var: kaynak (katman, başlık, özgün bağlantı), künye, editoryal ("neden bu kaynak", Türkçe özgün not, spoiler), haklar. Geri kalanı "isteğe bağlı alanlar"da. Yarım form cihazda saklanır. Kaynak sayfasındaki **yayın öncesi denetim** eksik maddeyi söyler; sunucu da aynı listeyle reddeder. Bağlantıyı açıp künyeyi kaynağın kendisinden doğruladıysan **"künyeyi ve bağlantıyı kontrol ettim"** de. Bağlantı ya da künye değişirse onay düşer. "Üye gibi gör" veritabanında üye yetkisiyle çalışır.
- **Editör kuyruğu (masa ana sayfası):** üye bildirimi ("bağlantı açılmıyor"), açık editör notu, kırık/belirsiz bağlantı, insan onayı bekleyen kaynak. Hiçbiri kendiliğinden düzelmez.
- **Gece:** `masa → geceler → yeni gece` (Istanbul saatiyle) oluştur, filmi seç, durumu "davet gönderildi" yap, davetlileri seç.
- **Konum:** gece sayfasında gerçek konumu gir ve açılış zamanını ayarla (ya da "şimdi aç"). Bilinmiyorsa boş bırak; üyeler "konum bilgisi henüz paylaşılmadı" görür. "Konum açıldı bildirimi" e-posta sağlayıcısı tanımlıysa gönderilir, değilse hiçbir şey gönderilmez ve durum kayda geçer.
- **Üye:** `masa → üyeler` ile ekle. Tek kullanımlık kod bir kez gösterilir; kişiye özel ilet. Kodu kaybederse "yeni davet kodu üret", ayrılırsa "üyeliği iptal et" (kodları ve oturumları anında düşer).

## v1'de biten

Kapı ve kişiye özel kodlar · oturumlar, rate limit, yönetici TOTP · RLS ile rol/yetki · oda · film dizini ve arşiv · okuma odası (yazdır/pdf) · "sonra" katmanı (oturum notları, tartışma, ileri okuma, moderasyon) · geceler, RSVP (son tarih, kapasite), konum açılma kuralı, `.ics` · davetiye 9:16 / 4:5 / kart (PNG/JPG) · defter (özel, isteğe bağlı paylaşım), sonra okunacaklar, okudum işaretleri · profil (anahtar yenileme, oturumlar, veri indirme) · masa: film/kaynak/soru/not CMS'i, taslak/yayın, üye gibi önizleme, taslak koruma, Markdown dışa aktarım, geceler, davetliler, bildirim kayıtları, bağlantı sağlığı, işlem kaydı, toplu davet · e-posta ile kod kurtarma (Resend; yoksa dürüst "sağlayıcı yok").

## v1.1: editoryal öncelik

Yeni özellik sayısı değil, önce → gece → sonra deneyimi: okuma sayfası (ilk ekran, kaynak başına gerekçe ve spoiler sırası, okudum / sonra oku, kaldığın yer, bağlantı bildirimi, JS'siz okuma), gece sayfası (davetiye ritmi, davet durumu, ön okumaya geçiş, net RSVP sonucu), sonra sayfası (editörün notu, masadan kalan sorular, kronolojik tartışma, ileri okuma, gecenin kaydı), film dosyası, masada yayın öncesi denetim, insan onayı ve kuyruk, geri alınabilir moderasyon. Güvenlik: RSVP yarışı, bağlantı denetiminde DNS rebinding / IPv6 yazımları, veritabanı düzeyinde önizleme, spoiler ve "sonra" korumaları, açık yönlendirme süzgeci. Ayrıntı ve gerekçeler: `docs/ARCHITECTURE.md` ("editoryal kurallar"), `docs/DESIGN.md` ("editoryal öncelik").

**Migrasyon:** `npm run db:migrate` `0003_editorial.sql`'i uygular. Ekleyici bir migrasyon: yeni sütunlar boş başlar, spoiler kısıtı `NOT VALID` (mevcut satırlara dokunmaz), yalnız PDF'lerden gelen ve editörün not yazmadığı satırlara köken / soru notu ekler. Geri almak için `db/rollback/0003_editorial.down.sql`, adımları içindedir. Seed, var olan film ve gecelere hiç dokunmaz (`seed.test.ts`).

## sonraki sürüm (backlog)

- Afiş ve medya yükleme: özel depolama, kullanım hakkı alanları, kapak kırpma önizlemesi. Şu an tasarım tamamen tipografik; görsel hakkı belirsiz afiş kullanılmıyor.
- Zaman kapsülü (gece öncesi 100–300 karakterlik düşünce, sonra birlikte açılır).
- Yıl sonu defteri, tematik izlekler (`hafıza`, `aile`, `suskunluk`), izinli müzik listesi, sezon dosyaları.
- Konum açılışında otomatik bildirim (şu an yönetici tetikliyor), QR ile check-in.
- Vektör sözcük işareti (tasarımcı onayıyla). Bkz. asset manifest.
- TMDB gibi yasal bir kaynaktan künye zenginleştirme (kullanıcı metinleri dışarı gönderilmeden).

## bilinen sınırlar

- Bu ortamdan dış sitelere erişim kapalıydı. Seed'deki 12 kaynak bağlantısı PDF'lerden birebir alındı ama **canlı doğrulanmadı**. Durumları "denetlenmedi" olarak başlar; yayındaki haftalık denetim (ya da `npm run links:check`) günceller.
- PDF'lerde bulunmayan alanlar (süre, ülke, 001'in gösterim tarihi, 001 kaynaklarının spoiler düzeyi, Screen Talk yılı) bilerek boş bırakıldı.
- 001'in PDF'i erken seçkidir (Murakami kitabı, Çehov oyunu, film önerileri). Kulübün sonraki, makale ve söyleşi ağırlıklı minimalist sürümü bu depoda yok. O satırlar editör kuyruğunda "erken PDF seçkisinden…" notuyla bekliyor; Word dosyası gelmeden tahminle değiştirilmedi.
- Notlar uçtan uca şifreli değildir. Arayüz bunu açıkça söyler.
- Hukuki metinler (aydınlatma, açık rıza, saklama süresi) hukuk danışmanı incelemesi gereken ayrı bir iştir. Uygulama KVKK uyumu iddia etmez.
- **Depo görünürlüğü:** GitHub deposu şu an herkese açık. Seed dosyası (`db/seed/content.ts`) iki filmin programını, 2. gecenin tarihini ve küratörün Türkçe notlarını içeriyor. Gerçek konum, üye adı, kod ya da anahtar depoda yok. Bu içeriklerin açık kalıp kalmayacağı kulübün kararı; seçenekler `docs/ARCHITECTURE.md` → "depo ve yayın stratejisi" bölümünde.
