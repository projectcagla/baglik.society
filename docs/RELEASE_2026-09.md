# release 2026-09 — teslim raporu

**Depo:** `projectcagla/baglik.society` · **dal:** `claude/baglık-society-app-t39fxz` · **PR:** #1 → `main`
**Başlangıç SHA:** `ed8f56d` (v1.1 sonu, CI yeşil) · **son kod commit'i:** bölüm 5'teki CI tablosunda
**Hedef gece:** `002 / canavar — hirokazu kore-eda`, 27 eylül 2026 pazar 19.30 (Europe/Istanbul)

Bu belge, `baglik_society_claude_final_release_master_prompt.md` şartnamesinin §12 teslim paketidir. "Test edildi" diyen her satırın yanında dosya ve sonuç var. Olmamış bir şey olmuş gibi yazılmadı.

---

## 1. başlangıçtaki gerçek durum ve eski bulguların akıbeti

| eski bulgu (şartname §1)                                                  | başlangıçta (ed8f56d)                                                             | şimdi                                                                                                                                                                                                                                       | kanıt                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Drive My Car seed'i eski kitap/film listesi                               | geçerli: 5 kaynak **yayında**                                                     | eski liste artık **taslak** ve editör kuyruğunda ("erken PDF seçkisinden…" notuyla). Son Word seçkisi depoda yok; **uydurulmadı**. Üyeye "seçki yok" görünüyor                                                                       | `db/seed/content.ts`, `docs/qa/2026-09/member/drive-my-car-sonra-*.webp`                                 |
| Canavar kaynaklarında `rationale` boş                                     | geçerli                                                                           | 4 temel kaynak için **editöre özel öneri** (`rationale_draft`); üyeye gitmiyor, editör "öneriyi alana taşı" ile kendi sözlerine çevirip onaylamadan yayımlanamaz. "neden bu kaynak" önce katmanının temel kaynakları için yayın koşulu | `db/migrations/0004_release.sql`, `src/lib/publish-check.ts`, `tests/unit/publish-check.test.ts`         |
| yayın kontrolü `approved_at`'i zorunlu tutmuyor                           | geçerli: yalnız UI'da bir düğme                                                   | **veritabanı kuralı**: dış bağlantılı kaynak, oturum açmış bir kişinin onayı olmadan yayımlanamaz; künye/URL değişince onay düşer ve yayındaki kaynak taslağa döner; script/seed/bağlantı denetleyicisi onay veremez                   | `tests/integration/editorial.test.ts` (6 test), `tests/e2e/admin.spec.ts`                                 |
| ekran görüntüleri kurucu hesabıyla                                        | geçerli (responsive testi kurucuyla)                                              | `docs/qa/2026-09/{anonymous,member,editor}` yalnız ilgili rolün oturumuyla; boş veritabanına production akışıyla kurulmuş yerel staging'de                                                                                                | bölüm 4                                                                                                  |
| kaynaklar canlı doğrulanmadı                                              | geçerli                                                                           | **hâlâ geçerli**: bu çalışma ortamından BFI, Criterion, Cannes ve lnk.to'ya ağ erişimi yok (denendi: `EGRESS_BLOCKED`). Hiçbiri "doğrulandı" diye işaretlenmedi; yayın insan onayına bağlandı                                      | bölüm 2                                                                                                  |
| repo herkese açık, program seed'de okunabilir                             | geçerli                                                                           | **hâlâ geçerli**, görünürlük değiştirilmedi; karar sahibinde (bölüm 3.6)                                                                                                                                                                   | GitHub API: `visibility: public` (25.09.2026)                                                            |
| PR #1 merge edilmedi                                                      | geçerli (`main` boş)                                                              | bölüm 7                                                                                                                                                                                                                                      | —                                                                                                        |

### değişiklik dökümü (ed8f56d → son)

| alan | ne değişti | neden |
| --- | --- | --- |
| **insan onayı** (P0) | `0004_release.sql`: `resources_publication_guard` tetikleyicisi; `rationale_draft`; DAL'da satır kilidi ve düzenleme sonrası denetim; masa: onaylayanın adı, "yayında ama onaysız" | §7, §11: onay UI süsü değil, iş kuralı |
| **seed** | kaynaklar taslak + köken; Canavar gerekçe önerileri; DMC iki taslak tartışma sorusu | §4.104, §5, §11 "eski seed" yolu |
| **okuma** | 2–4 temel okuma numaralı "seçki"; eşlik edenler tek satır + isteğe bağlı blok; "okuduğun: x / n" | §6 okuma hiyerarşisi |
| **kayıp kod** | e-posta sağlayıcı yokken "gönderilecek" demiyor; hiçbir kod üretmiyor | §7, §11 sahte başarı yasağı |
| **masa** | davet sayıları yalnız MFA'lı yöneticiye (editöre "0 davetli" yanıltması yerine açık cümle); 320 px taşma düzeltmesi | görsel QA'da bulundu |
| **yayın** | `/api/health`, `/kurulum` (SETUP_TOKEN ile tek seferlik kurucu), `npm run smoke`, `vercel.json` (fra1, build'de migrasyon), `DATABASE_URL_UNPOOLED` desteği, staging kabul iş akışı, runbook | §10 |
| **testler** | vitest 91 → 105 (+14), e2e Chromium 53 → 63 (+10), WebKit (iPhone) +2 ayrı CI adımında; Istanbul saati farklı sunucu saat dilimiyle (`TZ=Pacific/Kiritimati`, tarayıcı `America/Los_Angeles`) | §9 |

Bilinçli olarak yapılmayanlar (§2 P2): istatistik, öneri algoritması, rozet, sosyal akış, beğeni, QR, otomatik AI eleştirisi, mobil uygulama, arama motoru, medya yükleme, yeni logo. Marka dosyalarına dokunulmadı.

---

## 2. editoryal QA

### 2.1 canavar — gösterim öncesi (kaynak: `002_canavar_pre_reading_mobile.pdf`)

Film önerisi yok (test: `rls.test.ts` "no film recommendations, no books"). Seed'de hepsi **taslak**. Aşağıdaki künyeler PDF'ten aktarıldı; **hiçbiri canlı sayfayla karşılaştırılamadı** (ağ erişimi yok). Editör, yayımlamadan önce her birini açıp "künyeyi ve bağlantıyı kontrol ettim" demeli.

| # | türkçe başlık | özgün başlık · yazar · yayın · yıl | tür · dil | spoiler | URL | editörün bakacağı |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Gündelik hayatın ayrıntıları | *Where to begin with Hirokazu Koreeda* · Leigh Singer · BFI · 2016 | yazı · en | yok | bfi.org.uk/features/where-begin-hirokazu-koreeda | yıl (2016) ve yazar adı sayfada aynı mı |
| 02 | Bir başkasının iç dünyası | *On the Novelistic Afterlife of After Life* · Hirokazu Kore-eda · Criterion · 2021 | deneme · en | yok | criterion.com/current/posts/7515-… | yazar Kore-eda'nın kendisi mi, yayın yılı |
| 03 | Hafızanın bugünü | *Hirokazu Kore-eda's Parisian Rendezvous* · Hillary Weston · Criterion · 2020 | söyleşi · en | yok | criterion.com/current/posts/7022-… | yazar/söyleşen adı, yıl |
| 04 | Ailenin sınırları | *Hirokazu Koreeda on Broker* · Lou Thomas · BFI · 2023 | söyleşi · en | yok | bfi.org.uk/interviews/hirokazu-koreeda-broker-… | başlığın tamamı ("…familial unit"), yıl |
| + | Yaratıcı ekip | Cannes · kısa haber | resmî metin · en | **hafif** (konu özeti) | festival-cannes.com/en/2023/monster-kore-eda-returns/ | uyarı bağlantıdan önce görünüyor (test: `editorial.spec.ts`) |
| + | Ryuichi Sakamoto — 12 | *12* · Ryuichi Sakamoto · 2023 | müzik | yok | ryuichisakamoto.lnk.to/twelve | bağlantı albüme mi gidiyor |
| + | Kore-eda: Screen Talk | BFI · video · 47 dk | video · en | yok | player.bfi.org.uk/free/film/watch-hirokazu-kore-eda-screen-talk-2013-online | erişim ülkeye göre değişebilir (not zaten yazılı); yıl alanı boş |

- **Türkçe notlar** küratörün PDF'teki kendi özetleri; birebir çeviri değil ve tam metin kopyalanmadı. Okuma sayfasının altında bu açıkça yazıyor.
- **"neden bu kaynak" önerileri** (`rationale_draft`, yalnız editör görür) notun tekrarı olmasın diye kaynağın **rolünü** söylüyor: 01 ilk kez izleyecekler için giriş; 02 yönetmenin kendi kaleminden bakış sorusu; 03 hatırlama ve anlatma zemini; 04 bu filme en yakın zamandan aile/aidiyet. Bunlar **Çağla'nın görüşü değildir** ve onaysız yayımlanamaz.
- Okuma süresi sayfanın kendi metninden hesaplanıyor ("bu sayfadaki notlar yaklaşık N dk"); özgün makalelerin süresi uydurulmuyor.

### 2.2 drive my car — eski seçki / son seçki

| kaynak (erken PDF: `001_drive_my_car_short_reading.pdf`) | tür | durum |
| --- | --- | --- |
| *Men Without Women* — Haruki Murakami | kitap | taslak · editör notu: son sürümle karşılaştırılmalı |
| *Vanya Dayı* — Anton Çehov | kitap | taslak · aynı not |
| *Drive My Car: Grace Notes* — Bryan Washington · Criterion | deneme | taslak |
| *Wheel of Fortune and Fantasy* — Ryūsuke Hamaguchi · 2021 | film | taslak · aynı not |
| *After Life* — Hirokazu Kore-eda · 1998 | film | taslak · aynı not |

**Fark listesi çıkarılamadı:** son, makale ve söyleşi ağırlıklı Word seçkisi bu depoda, eklerde ya da önceki pakette yok. Gelince: kaynakları masadan (ya da onaylı bir listeden idempotent bir aktarma betiğiyle) taslak olarak eklerim; eski satırlar silinmez, arşivlenir ya da elle eşleştirilir. Okuma işaretleri korunur.

"sonra" katmanı: PDF'teki tek soru yayında ("Bir başkasını gerçekten tanımak için…"). İki **taslak** öneri soru var (açılış jeneriğinin geç gelişi; provalardaki çok dillilik); yayımlamak editörün kararı. Gecenin gerçek tarihi ve notları olmadığı için "gecenin kaydı" **"izlendi · tarihi kayda geçmedi"** diyor.

---

## 3. güvenlik ve mahremiyet QA

### 3.1 rol × yol matrisi (gerçek HTTP, production build) — `tests/e2e/authz-matrix.spec.ts`

| yol | anonim | davetli üye | davetsiz üye | editör | kurucu | iptal edilmiş (açık oturumla) |
| --- | --- | --- | --- | --- | --- | --- |
| `/filmler/002-canavar/okuma` | kapı | 200 | 200 | 200 | 200 | kapı |
| `/filmler/001-drive-my-car/sonra` | kapı | 200 | 200 | 200 | 200 | kapı |
| `/filmler/002-canavar/sonra` (kapalı) | kapı | 200, içerik yok | 200, içerik yok | 200 + taslak | 200 + taslak | kapı |
| taslak film | kapı | 404 | 404 | 200 | 200 | kapı |
| `/geceler/2` | kapı | 200 | **404** | 200 | 200 | kapı |
| `/geceler/2/takvim` · davetiye görseli | kapı | 200 | 404 | 200 | 200 | 404 |
| markdown dışa aktarım | kapı | 404 | 404 | 200 | 200 | 404 |
| `/masa` | kapı | 403 | 403 | 200 | 200 | kapı |

Her hücrede taslak kaynak, yayımlanmamış "sonra" kaynağı, taslak film adı ve açılmamış konum **HTML'de ve RSC yükünde** aranıyor. MFA'lı yönetici: `location.test.ts`, `admin.spec.ts`, `journey.spec.ts`. MFA'nın süresi dolunca yetki düşüyor: `mfa-expiry.test.ts`.

### 3.2 diğer kanıtlar

| senaryo | sonuç | test |
| --- | --- | --- |
| anonim: URL tahmini, `HEAD`, link önizleme botları (Facebook, Slack, WhatsApp, Twitter, Google) | hepsi aynı 303 → kapı; kapıda film/tarih/üye adı yok; `og:image` yok; `noindex` | `security.spec.ts`, `public.spec.ts`, `npm run smoke` |
| konum yayından önce | HTML, RSC, ICS, davetiye görseli ve e-postada yok; açılınca yalnız seçili hedef kitle | `location.test.ts`, `location-leak.spec.ts`, `journey.spec.ts`, staging kabul adımı 12 |
| iptal edilmiş hesabın açık oturumu | anında geçersiz | `authz-matrix.spec.ts` (revoked) |
| son koltuk yarışı / tekrar RSVP | kapasite aşılmıyor / idempotent | `rsvp-concurrency.test.ts`, `editorial.spec.ts` |
| onay ile düzenleme yarışı | onaysız yayın mümkün değil | `editorial.test.ts` |
| SSRF (DNS rebinding, IPv4 yazımları, gömülü IPv6, yönlendirme) | engelli; gerçek yerel sunucuya istek gitmiyor | `ssrf.test.ts` |
| açık yönlendirme, XSS, yabancı Origin (CSRF) | reddediliyor | `return-path.test.ts`, `richtext.test.ts`, `security.spec.ts` |
| sunucu sırları istemci paketinde | yok (`.next/static` taraması) | `security.spec.ts` |
| sağlık sinyali / veritabanı kopması | `ok` / `unavailable`, ayrıntı yok | `health.test.ts`, `security.spec.ts` |
| ilk kurucu kurulumu | token olmadan kapalı; iki eşzamanlı istekten biri; 5 yanlışta kilit; kurucu oluşunca kapanıyor | `setup.test.ts`, `security.spec.ts`, staging kabul |
| üye veri dışa aktarımı / silme | yalnız kendi kayıtları; silme masada | `security.spec.ts`, `rls.test.ts` |

### 3.3 açık kalanlar (dürüstçe)

- **Depo görünürlüğü:** herkese açık. Seed'de program, 2. gecenin tarihi ve küratörün PDF notları var. Geçmiş commit'ler de açık; görünürlüğü değiştirmek ileriyi korur, geçmişte açık olduğunu değiştirmez. Seçenekler `PRODUCTION_RUNBOOK.md` §0'da.
- **KVKK:** uygunluk iddia edilmiyor; aydınlatma metni ve saklama süreleri hukuk incelemesi bekliyor.
- **Özel defter** uçtan uca şifreli değil; arayüz bunu söylüyor.

---

## 4. görsel QA

- `docs/qa/2026-09/anonymous/` — kapı, kayıp kod (e-posta yokken dürüst cümle).
- `docs/qa/2026-09/member/` — oda, canavar önce/okuma, canavar gece, canavar film dosyası, drive my car sonra, defter.
- `docs/qa/2026-09/editor/` — masa kuyruğu, yeni kaynak formu, kaynak onay sayfası.
- Hepsi 320 / 390 / 1440. Yatay taşma her sayfada 0 px (ölçüldü). 320 px'deki masa taşması bu turda bulundu ve düzeltildi.
- Erişilebilirlik: axe (WCAG 2 A/AA) ciddi/kritik ihlal **0** (`responsive-a11y.spec.ts`). %150 metin büyütmede taşma yok; işaret düğmeleri ≥ 44 px (`mobile.spec.ts`).
- **WebKit (iPhone 13 profili):** `mobile.spec.ts` CI'da ayrı adımda koşuyor. İlk koşuda test sunucusu düz HTTP olduğu için WebKit `Secure` oturum çerezini saklamadı; üretim HTTPS'tir. WebKit adımı artık yerel HTTP kaçışıyla (`INSECURE_COOKIES`) koşuyor; Chromium adımı üretimdeki `__Host-` çerezini sınıyor. CI sonucu: **2/2 geçti** (oda → okuma → gece, %150 metin, ≥ 44 px hedefler, JS'siz okuma ve RSVP). **Gerçek bir iPhone Safari'de elle kontrol yayından sonra yapılmalı** (runbook §10).

---

## 5. CI kanıtı

Ayrıntılı bağlantılar PR #1'in Checks sekmesinde. Bu raporu ekleyen doküman commit'inin CI sonucu teslim mesajında yazılıdır.

| commit | ne | yerel sonuç | CI |
| --- | --- | --- | --- |
| `ac3a232` | onay kapısı, seed, güvenlik testleri | vitest 102, e2e 63 | kırmızı: `setup.test` paylaşılan DB'deki kurucuya bağımlıydı → `010ea59` |
| `010ea59` | kurulum testi düzeltmesi | vitest 105 | Chromium 63/63 yeşil; WebKit 2 test kırmızı (HTTP'de Secure çerez) → `3755488` |
| `3755488` | runbook, WebKit adımı, görsel QA | vitest 105, e2e 63 | **yeşil**: format, lint, typecheck, vitest 105, Chromium 63/63, **WebKit (iPhone 13) 2/2** — [push](https://github.com/projectcagla/baglik.society/actions/runs/36150901142), [PR](https://github.com/projectcagla/baglik.society/actions/runs/36150908822) |

Atlanan (skip) kritik test yok. Başarısız testleri geçirmek için assertion gevşetilmedi; her düzeltmenin kök nedeni yukarıda.

---

## 6. staging

- **Barındırılan staging kurulamadı:** bu oturumun Vercel ya da Neon hesabına erişimi yok ve olmadan varmış gibi davranılmadı.
- **Yerel staging (yapıldı):** boş bir veritabanı, ayrı rastgele gizli değerler, `SETUP_TOKEN`, e-posta sağlayıcısı yok, production build. Kurulum, Vercel build'iyle aynı sırada yapıldı (`db:migrate` → `db:seed` → `next start`).
  - `npm run smoke`: **20/20** ✓, kurulum açık (henüz kurucu yok).
  - `tests/acceptance/staging.spec.ts` (üç ayrı oturum + kurucu + davetsiz, yalnız sentetik hesaplar): **13/13 adım** ✓.

| rol | adım | sonuç |
| --- | --- | --- |
| anonim | kapıda yalnız logo ve kod alanı · özel adresler 303 | ✓ |
| kurucu | `/kurulum` → kişisel anahtar → ikinci doğrulama; ardından `/kurulum` kapandı | ✓ |
| kurucu | editör, üye, davetsiz üye; üye 2. geceye davetli | ✓ |
| editör | yönetici alanı 403 · 7 Canavar kaynağı onaylanıp yayımlandı (sentetik onay) · üye gibi önizleme | ✓ |
| üye (iPhone) | ön okuma → okudum · RSVP · konum ve takvimde adres yok · "sonra" kapalı | ✓ |
| davetsiz | `/geceler/2` → 404 | ✓ |
| kurucu | kurmaca konum yalnız "geliyorum" diyen üyeye açıldı, sonra geri çekildi | ✓ |

- **Gerçek staging için:** Vercel Preview + ayrı Neon DB kurulunca GitHub → Actions → **staging-acceptance** aynı senaryoyu tek tıkla koşar (runbook §3.8).

---

## 7. yayın kararı

| | durum | gerekçe |
| --- | --- | --- |
| **merge (PR #1 → main)** | teslim mesajında belirtilir | CI yeşil ve çakışmasızsa, kullanıcının "yayınlayana kadar ilerle" talimatıyla birleştirilir; `main` dağıtılabilir hâle gelir |
| **staging** | **kullanıcı erişimi bekleniyor** | Vercel/Neon hesabı gerekiyor; yerel staging kabulü tamam |
| **production** | **kullanıcı onayı ve erişimi bekleniyor** | hesap, gizli değerler, depo görünürlüğü kararı ve Canavar kaynaklarının insan onayı gerekiyor |

**Neden henüz yayında değil:** Uygulama, testler ve kurulum yolu hazır. Canlıya çıkmak için bir Vercel projesi ve bir Neon veritabanı gerekiyor; ikisi de sahibinin hesabında açılmalı ve gizli değerler panele sahibi tarafından girilmeli. Ardından Canavar kaynaklarının bir kişi tarafından kontrol edilip yayımlanması gerekiyor: bu, tasarım gereği bir yazılımın ya da bu çalışmanın yerine geçemeyeceği bir adım. **Uygulanabilir son adım:** runbook §3'ü staging için uygula, staging adresini paylaş (sır değil). Staging kabulü yeşil olunca aynı adımları production için tekrarla ve §4'ü (≈30 dk) pazar öncesinde tamamla.

**Gece için sorumlu:** konumun gece günü açılması ve e-posta sağlayıcı yoksa elle iletilmesi, sahibin belirleyeceği MFA'lı bir yöneticidedir (runbook §0).
