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
   /oda                 sıradaki gece · son eklenen · arşivden tek satır
   /filmler             sırada · arşiv (· öneriler yalnız masaya)
     /[no-ad]           önce: seçki dizini, künye, geceler
       /okuma           okuma odası (akışkan HTML, yazdır/pdf)
       /sonra           oturum notları · tartışma · ileri okuma  (yayımlanınca)
   /geceler             yaklaşan · geçmiş (yalnız davetli olunanlar)
     /[n]               davet: tarih, konum durumu, katılım, takvim
       /davetiye        9:16 · 4:5 · metin kartı (png/jpg)
   /defter              kişisel notlar · paylaşılanlar · kaydedilenler
   /profil              ad/e-posta · kişisel anahtar · oturumlar · verilerin
   /hosgeldin           ilk girişte kişisel anahtar
   /masa                özet · filmler · geceler · üyeler · bağlantılar · kayıt · güvenlik
```

Üst düzeyde dört bölüm var: `oda · filmler · geceler · defter`. Monogram profile, `masa` yalnızca yetkiliye. Hamburger menü yok. 320 px'de bile dört kelime tek satıra sığıyor.

## kompozisyon alternatifleri

Brief ana ruhu koruyan iki gerekçeli alternatif istiyordu. Ortam otomatik çalıştığı için master'a en sadık olan **A** uygulandı. **B**, istenirse CSS düzeyinde küçük bir değişiklikle denenebilir.

### kapı

**A: master kilidi (uygulandı).** Portal `b` üstte, sözcük işareti altta; ikisi de master'dan kırpıldı ve aralarındaki oran korundu. Altında ince tek bir çizgi-alan, ortalanmış `giriş kodu` etiketi, göster/gizle ve hap biçimli `giriş` düğmesi var. Mobilde portal ~184 px, masaüstünde 224 px: davetkâr ama bir pazarlama görseli kadar şişkin değil. Zeminde çok hafif, statik grenle portalın arkasında neredeyse fark edilmeyen mor bir ışık var. *Gerekçe:* Onaylanan görsel zaten bu kilit. Kapı "hiçbir şey söylemeden" markanın tamamını gösteriyor.

**B: yalnızca sözcük işareti.** Portal görünmüyor, küçük sözcük işareti ve alan var. Portal içeride, odaya geçişte beliriyor. *Gerekçe:* Kapı daha da suskun olur ve "eşikten geçme" hissi girişten sonra yaşanır. *Neden seçilmedi:* Portal bu kimliğin en ayırt edici öğesi. Onu kapıdan kaldırmak, onaylı master'dan uzaklaşmak olurdu.

### oda

**A: davetiye ritmi (uygulandı).** Ortalanmış tek sütun: `sıradaki gece · 2. film gecesi`, mor `002`, büyük serif `canavar`, italik yönetmen, kısa çizgi, tarih, "2 gün sonra", kısa çizgi, konum cümlesi. Ardından iki eylem: `ön okumaya geç` ve `katılımını bildir`. Altta ince bir çizgiyle ayrılan `son eklenen` ve tek satırlık `arşiv — 001 / drive my car` var. Dashboard kartı yok. *Gerekçe:* Onaylanan 2. gece davetiyesinin dilini içeriye taşıyor. Ekranda tek baskın karar var.

**B: editoryal sol hizalı.** Solda büyük film adı ve künye, sağ sütunda (masaüstü) tarih/konum/eylem. Mobilde tek sütun, sola hizalı. *Gerekçe:* Uzun film adlarında daha dengeli. Festival kataloğu hissi daha güçlü. *Neden seçilmedi:* Davetiyeyle aynı ritmi kurmuyor. Film ve okuma sayfaları zaten bu sol hizalı editoryal düzeni kullanıyor, odanın ayrışması iyi.

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

`docs/screenshots/` (production build, Chromium, 2x):

| | |
| --- | --- |
| kapı 390 / 320 / 1440 | `kapi-390.webp`, `kapi-320.webp`, `kapi-1440.webp` |
| oda 390 / 1440 | `oda-390.webp`, `oda-1440.webp` |
| film ve okuma odası | `film-1440.webp`, `okuma-390.webp` |
| sonrası (001) | `sonra-390.webp` |
| gece / davet | `gece-390.webp`, `davetiye-1440.webp` |
| defter, masa | `defter-390.webp`, `masa-390.webp` |

Test her çalıştığında tüm sayfaların tam boy görüntüleri `artifacts/screenshots/` klasörüne yeniden üretiliyor (CI'da artefakt olarak saklanıyor).
