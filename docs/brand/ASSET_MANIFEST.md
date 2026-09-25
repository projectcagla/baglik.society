# marka varlıkları — doğrulanmış manifest

Bu dosya, sitede kullanılan her marka görselinin nereden geldiğini ve onaylı master'a göre ne kadar sadık olduğunu kayıt altına alır. Yeni bir logo çizilmedi; aşağıdaki "türev" dosyaları master'dan kırpılmış ya da master'ın piksel koordinatları üzerinde izlenmiş çalışma kopyalarıdır.

## kaynaklar (paketten gelenler)

| dosya | statü | repoda mı | not |
| --- | --- | --- | --- |
| `01_APPROVED_identity_master_reference.jpg` (588×751) | **onaylı master** | evet — `brand/source/` | Kapıda zaten herkese gösterilen işaret olduğu için repoda tutulabilir. |
| `02_portal_symbol_transparent_concept` (820×1040, alfa kanallı) | ikincil konsept | hayır | Master'la karşılaştırıldı: `b` gövdesi daha dolgun, figür daha büyük ve ışık dağılımı farklı. Arayüzde **kullanılmadı**. |
| `03_film_night_002_invitation_reference` (941×1672) | davetiye stili | hayır (`brand/private-reference/`, gitignore) | Tarih ve film adı içerdiği için repoya konmadı. Yalnızca metinsiz portal katmanı türetildi (aşağıda). |
| `04_identity_moodboard_EXPLORATION_ONLY` | keşif, bağlayıcı değil | hayır | Mühür, yıldız sembolü ve Playfair önerisi **uygulanmadı**. |

## master'daki değişmezler

1. `b`, mimari bir kapı: kalın gövde, sola bakan eğik bayrak serifi, ince kılcal bağlantıyla gövdeye tutunan kemer; kemerin içi karanlık bir kapı boşluğu.
2. Kapının sağ ayağının önünde, arkası dönük küçük bir insan silüeti ve zemine düşen kısa gölge.
3. Zemin: gövdenin dibinden sağa doğru açılan eğik ışık düzlemi (eşik).
4. Renk: üstte kırık gümüş-beyaz, aşağı indikçe mat mora dönen dikey geçiş; yüzeyde iri doku ve film greni.
5. Sözcük işareti `bağlık.society` — yüksek kontrastlı, küçük harfli serif; `ğ` ve noktasız `ı` doğru. Kelime işareti bir fonttan yeniden dizilmedi, master'dan kırpıldı.
6. Zemin: neredeyse saf siyah (master'da ≈ `#020204`); sitede `#0A0A0C`.

## türevler

| dosya | nasıl üretildi | nerede kullanılıyor | fark |
| --- | --- | --- | --- |
| `public/brand/portal.png/.webp` (396×396) | master kırpımı, siyah zemin → alfa (parlaklıktan), kenarlarda %10 yumuşak geçiş | kapı, oda | Piksel değerleri korunur; yalnızca siyah zemin saydamlaştırıldı. Kaynak çözünürlüğü düşük: 2x ekranda ≤ 198 px genişlikte net. |
| `public/brand/wordmark.png/.webp` (484×112) | master kırpımı, alfa | kapı, üst başlık | 2x ekranda ≤ 240 px genişlikte net. Daha büyük kullanım için vektör sözcük işareti gerekir (aşağıda "açık konular"). |
| `public/brand/lockup.webp` | master'daki portal + sözcük işareti, kendi aralığıyla | önizleme / belge | — |
| `src/assets/brand/portal-hd.png` (680×960) | davetiye referansındaki metinsiz portal katmanı, alfa | 1080×1920 davetiye dışa aktarımı | Davetiyedeki portal, master ile aynı çizim ailesinden ama birebir değil: doku daha iri, figür biraz daha büyük, sağ tarafta toz/ışık saçılması fazla. Yalnızca büyük baskı çıktısında, davetiye stiline sadık kalmak için kullanılıyor. |
| `public/brand/mark.svg` | master piksel koordinatlarında elle izlenmiş tek renk yol (`scripts/brand/mark-path.mjs`) | 404/erişim sayfaları, küçük kullanımlar | Doku, grenler ve ışık saçılması **yok**. Kemerin kılcal bağlantısı ve figür sadeleştirildi. Kontur karşılaştırması: `docs/brand/mark-comparison.png`. |
| `src/app/icon.svg` | `mark.svg` gövdesi, figürsüz, koyu kare zemin | favicon | 32 px'de figür 2 px'in altına düştüğü için çıkarıldı. |
| `public/brand/icon-192/512.png`, `icon-maskable-512.png`, `src/app/apple-icon.png` | master kırpımı (dokulu) koyu kare üstünde | PWA / iOS ana ekran | Maskable sürümde güvenli alan için %20 iç boşluk. |

Türevleri yeniden üretmek için:

```bash
node scripts/brand/derive-assets.mjs   # raster kırpımlar (master + varsa davetiye referansı)
node scripts/brand/build-mark.mjs      # SVG işaret, favicon, karşılaştırma görseli
```

## tipografi kararı

- Başlık / editoryal serif: **Cormorant Garamond** (400, 500, 600 + italik). Master'ın yüksek kontrastlı serifine en yakın açık lisanslı aday. Sözcük işaretinin yerine geçmez; yalnızca başlıklarda.
- Gövde / arayüz: **Inter** (400, 500, italik).
- Küçük meta (program numarası, tarih, künye): **IBM Plex Mono** 400.
- Hepsi SIL OFL; `public/fonts/` altında self-host, `latin` + `latin-ext` alt kümeleri `unicode-range` ile. `ğ Ğ ı İ ş Ş ç Ç ö Ö ü Ü` ve `ū` (Ryūsuke) test edildi (bkz. `/masa` tipografi örneği ve e2e ekran görüntüleri).
- Kendi PDF'lerinde kullandığın EB Garamond + Noto Sans ikilisine de geçiş kolay: yalnızca `src/app/fonts.css` değişir.

## açık konular (ekip incelemesi için)

1. **Vektör sözcük işareti yok.** Master raster; 240 px üstünde yumuşama başlar. Kesin çözüm: tasarımcının onaylayacağı bir vektör yeniden çizim. Bu repo onu uydurmadı.
2. `mark.svg` sadeleştirilmiş bir çalışma kopyasıdır; baskı veya tabela için kullanılmamalı.
3. Görsellerin telif/kullanım hakları yayın öncesi ekipçe değerlendirilmelidir.
