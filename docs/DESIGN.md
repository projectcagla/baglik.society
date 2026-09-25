# tasarım: bilgi mimarisi, kompozisyon, mobil yaklaşım

## ürün görüşü

**Dışarıdan hiç görünmeyenler:** film adları, geceler, tarihler, okumalar, üye sayısı ve adları, kurucu bilgisi, menü, "hakkımızda", kayıt formu, sosyal bağlantılar, önizleme görseli. Kamuya açık yüzey yalnızca onaylı işaret, bir kod alanı ve "kodunu mu kaybettin?" bağlantısından ibaret.

**İçeride üyeye açılanlar:** sıradaki gece ve ona hazırlık (ön okuma), davetli olduğu geceler (katılım, takvim, davetiye, zamanı gelince konum), birikmiş film arşivi, "sonrası" katmanı (oturum notları, tartışma, ileri okuma), kişisel defter. Masa (CMS) yalnızca editör ve yöneticilere görünür.

**Onaylı markadan alınan ilkeler:** gece siyahı zemin, kapı olarak `b`, ölçülü tek ışık (yalnızca portalın arkasında, çok hafif), yüksek kontrastlı serif, küçük harfli markalı metin, seyrek bilgi, kısa mor çizgiler (davetiye ritmi), büyük boşluk.

## bilgi mimarisi

```
/                       kapı (tek alan)
/kayip-anahtar          tek kullanımlık kod iste
└─ üye alanı
   /oda                 yalnız sıradaki gece: ön okumaya geç · katılımını bildir (· arşivden tek satır)
   /filmler             sırada · arşiv (gösterim sırasıyla; · öneriler yalnız masaya)
     /[no-ad]           film dosyası: önce · gece · sonra, künye, "senin için" (yalnız sana)
       /okuma           önce: gösterim öncesi okuma (yazdır/pdf, JS'siz okunur)
       /sonra           sonra: editörün notu · masadan kalan sorular · tartışma · ileri okuma · gecenin kaydı
   /geceler             yaklaşan · geçmiş (yalnız davetli olunanlar)
     /[n]               gece: dijital davetiye, davet durumu, katılım, takvim, ön okumaya geçiş
       /davetiye        9:16 · 4:5 · metin kartı (png/jpg)
   /defter              kişisel notlar · paylaşılanlar · sonra okunacaklar
   /profil              ad/e-posta · kişisel anahtar · oturumlar · verilerin
   /hosgeldin           ilk girişte kişisel anahtar
   /masa                özet + editör kuyruğu · filmler · geceler · üyeler · bağlantılar · kayıt · güvenlik
```

Üst düzeyde dört bölüm var: `oda · filmler · geceler · defter`. Monogram profile, `masa` yalnızca yetkiliye. Hamburger menü yok. 320 px'de bile dört kelime tek satıra sığıyor.

## kompozisyon alternatifleri

Brief ana ruhu koruyan iki gerekçeli alternatif istiyordu. Ortam otomatik çalıştığı için master'a en sadık olan **A** uygulandı. **B**, istenirse CSS düzeyinde küçük bir değişiklikle denenebilir.

### kapı

**A: master kilidi (uygulandı).** Portal `b` üstte, sözcük işareti altta; ikisi de master'dan kırpıldı ve aralarındaki oran korundu. Altında ince tek bir çizgi-alan, ortalanmış `giriş kodu` etiketi, göster/gizle ve hap biçimli `giriş` düğmesi var. Mobilde portal ~184 px, masaüstünde 224 px: davetkâr ama bir pazarlama görseli kadar şişkin değil. Zeminde çok hafif, statik grenle portalın arkasında neredeyse fark edilmeyen mor bir ışık var. *Gerekçe:* Onaylanan görsel zaten bu kilit. Kapı "hiçbir şey söylemeden" markanın tamamını gösteriyor.

**B: yalnızca sözcük işareti.** Portal görünmüyor, küçük sözcük işareti ve alan var. Portal içeride, odaya geçişte beliriyor. *Gerekçe:* Kapı daha da suskun olur ve "eşikten geçme" hissi girişten sonra yaşanır. *Neden seçilmedi:* Portal bu kimliğin en ayırt edici öğesi. Onu kapıdan kaldırmak, onaylı master'dan uzaklaşmak olurdu.

### oda

**A: davetiye ritmi (uygulandı).** Ortalanmış tek sütun: `sıradaki gece · 2. film gecesi`, mor `002`, büyük serif `canavar`, italik yönetmen, kısa çizgi, tarih, "2 gün sonra", kısa çizgi, konum cümlesi. Ardından iki eylem: `ön okumaya geç` ve `katılımını bildir`. Altta ince bir çizgiyle ayrılan tek satırlık `arşiv — 001 / drive my car` var. v1.1'de `son eklenen` kutusu kaldırıldı: oda haber panosu değil, sıradaki gecenin kapısı. Dashboard kartı yok. *Gerekçe:* Onaylanan 2. gece davetiyesinin dilini içeriye taşıyor. Ekranda tek baskın karar var.

**B: editoryal sol hizalı.** Solda büyük film adı ve künye, sağ sütunda (masaüstü) tarih/konum/eylem. Mobilde tek sütun, sola hizalı. *Gerekçe:* Uzun film adlarında daha dengeli. Festival kataloğu hissi daha güçlü. *Neden seçilmedi:* Davetiyeyle aynı ritmi kurmuyor. Film ve okuma sayfaları zaten bu sol hizalı editoryal düzeni kullanıyor, odanın ayrışması iyi.

## editoryal öncelik (v1.1): önce → gece → sonra → arşiv

**Okuma sayfası (önce).** Telefonun ilk ekranında yalnız şunlar var: `002 / gösterim öncesi`, film adı, yönetmen · yıl, üç belgenin (önce · gece · sonra) kısa gezintisi, gerçek kaynak sayısı ve bu sayfadaki notların okuma süresi (sayfanın kendi metninden hesaplanır; özgün metinlerin süresi yalnız editör ölçtüyse ayrıca yazılır), ardından içindekiler. Her kaynakta sıra hep aynı: sıra numarası, Türkçe küratör başlığı, özgün başlık (başlıkta zaten geçiyorsa tekrar yazılmaz), künye (yayın · yazar · biçim · yıl · süre), tür · dil · spoiler durumu, "neden bu kaynak", Türkçe özgün not (170 kelimeyi aşan not ilk paragraftan sonra `<details>` ile katlanır; JS'siz açılır), spoiler uyarısı, sonra tek ve açıkça etiketlenmiş özgün bağlantı. Spoiler uyarısı belgede bağlantıdan önce gelir; CSS ile gizlenen bir şey yok. `okudum` / `sonra oku` yalnız üyenin kendisine ait. "Kaldığın yer" yalnız cihazda (localStorage) tutulur, sunucuya iz gitmez. "Bağlantı açılmıyor mu?" editör kuyruğuna düşer. Görünüm bağımsız bir dergi sayfası gibi: Cormorant başlıklar, 18 px Inter gövde, 1,78 satır aralığı.

**Gece sayfası.** Onaylı davetiyenin dijital karşılığı: ölçülü boyutta onaylı portal (`/brand/portal.webp`, telefonda ~5,5–7,5 rem), `2. film gecesi`, mor `002`, `canavar`, `hirokazu kore-eda`, `27 eylül 2026 · pazar · 19.30` (Europe/Istanbul), "konum etkinlik günü davetlilere iletilecektir", davet durumu ("davetlisin · katılımını henüz bildirmedin"), `ön okumaya geç`. Katılım sonucu açıkça yazılır ("kaydedildi: geliyorum."). Aynı cevabın tekrarı hiçbir şeyi değiştirmez.

**Sonra sayfası.** Beş bölüm: (1) editörün notu, isteğe bağlı, 80–180 kelime, insan yazar; boşken üye bu bölümü hiç görmez; (2) masadan kalan sorular; (3) her sorunun altında sakin, kronolojik tartışma: en çok iki yanıt derinliği, beğeni/sayaç yok, adlı ya da adsız, düzenleme yok, geri çekme var; (4) spoiler uyarılı ileri okuma; (5) gecenin kaydı: yalnız gerçekleşen gece (tarih kayıtlı değilse "tarihi kayda geçmedi"), seçkiye bağlantı, soru ve katkı sayısı. Fotoğraf ve katılımcı adı yok.

**Film dosyası.** `/filmler/[no-ad]` üç belgeyi tek yerde toplar. Yanda künye ve "senin için": kaç kaynağı okuduğun, sonra okunacaklar, bu filme dair defter notların. Yalnız sana görünür.

**Masa.** Kaynak formu dört kısa bölüm (kaynak · künye · editoryal · haklar) ve kapalı bir "isteğe bağlı alanlar" bölümünden oluşuyor. Zorunlular `*` ile işaretli. Yarım bırakılan form cihazda saklanıyor (DraftKeeper). Kaynak sayfasında yayın öncesi denetim listesi ve "künyeyi ve bağlantıyı kontrol ettim" onayı var. Masa ana sayfasında editör kuyruğu.

## mobil yaklaşım

- Önce 375/390 px, sonra 768 ve 1280/1440. Testler 320×568, 375×812, 390×844, 768×1024 ve 1440×900 boyutlarında yatay taşma ve görünür alan dışına çıkan öğe arıyor (`tests/e2e/responsive-a11y.spec.ts`).
- Gövde 16 px'in altına inmiyor. Okuma notları 18 px, satır aralığı 1,78, ölçü ~36 rem (≈ 60–68 karakter). Yalnızca künye ve program numarası gibi meta bilgiler 13 px mono.
- Dokunma hedefleri 44–48 px. `viewport-fit=cover` ve `env(safe-area-inset-*)` ile çentik desteği var.
- Uzun URL, e-posta ve özgün başlıklar `overflow-wrap: anywhere` ile kırılıyor.
- Hareket 150–250 ms, `prefers-reduced-motion` ile kapanıyor. Girişten sonra odaya yalnızca 240 ms'lik bir solma var.
- JS kapalıyken kapı, katılım ve formlar çalışıyor (Server Actions ile aşamalı geliştirme). Bu durum e2e ile test ediliyor.

## tipografi ve renk

- Başlıklar Cormorant Garamond 500 (italik yönetmen/soru). Arayüz ve gövde Inter. Meta IBM Plex Mono. Hepsi self-host ve `unicode-range` ile yükleniyor.
- Renk token'ları `src/app/globals.css` içinde: `--bg #0A0A0C` (sabit), `--bg-raised #131118`, `--ink #F2EEF3`, `--ink-2 #B5ACBB`, `--ink-3 #8F8697` (en küçük metin için ≥ 5,7:1), `--accent #B897DC`, `--accent-deep #56326D`, `--line`. Durum renkleri sakin tutuldu ve her durum ayrıca metinle ya da işaretle belirtiliyor (✓ / !).
- Sayfalar axe (WCAG 2 A/AA) ile tarandı. Ciddi veya kritik ihlal yok.

## ekran görüntüleri

`docs/qa/2026-09/` — release 2026-09 görsel QA seti. Production build, **boş bir veritabanına production akışıyla** kurulmuş yerel staging (`/kurulum` → kurucu → editör/üye); Chromium, 1x. Her klasör yalnız o rolün gerçek oturumuyla alındı; kurucu ekranı üye görüntüsü olarak kullanılmadı. Veriler sentetik; kod, anahtar ya da konum yok.

| klasör       | sayfalar (her biri 320 / 390 / 1440)                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `anonymous/` | `kapi`, `kayip-anahtar` (e-posta sağlayıcı yokken dürüst cümle)                                                      |
| `member/`    | `oda`, `canavar-once-okuma`, `canavar-gece`, `canavar-dosya`, `drive-my-car-sonra`, `defter`                         |
| `editor/`    | `masa-kuyruk`, `masa-yeni-kaynak`, `masa-kaynak-onay` (yayın öncesi denetim + insan onayı)                          |

iPhone / WebKit: `tests/e2e/mobile.spec.ts` CI'da WebKit (iPhone 13 profili) ile de koşar; ekran görüntüleri CI artefaktında (`artifacts/qa/webkit-iphone/member/`). Gerçek bir iPhone Safari'de elle kontrol yayın sonrası yapılmalı (bkz. `docs/RELEASE_2026-09.md`).

Test her çalıştığında tüm sayfaların tam boy görüntüleri `artifacts/screenshots/` klasörüne yeniden üretiliyor (CI'da artefakt olarak saklanıyor).
