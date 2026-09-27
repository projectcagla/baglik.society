# cPanel kurulumu — bagliksociety.cag.la

bağlık.society'yi mevcut paylaşımlı hosting'inde (cPanel, "Setup Node.js App") **hiçbir şey satın almadan** çalıştırmak için adım adım yol. Değer değil yalnız **adlar** yazılıdır: gizli değerler hiçbir zaman bu depoya, bir PR'a, sohbete ya da ekran görüntüsüne girmez.

**Neyin nerede çalıştığı**

| parça                        | nerede                                                           | neden                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| uygulama (Next.js, Node 22)  | senin hosting'in — Setup Node.js App (Phusion Passenger)         | alan adın, SSL'in ve paketin zaten orada                                                                                                       |
| veritabanı (PostgreSQL 16)   | **Neon**, ücretsiz plan, Frankfurt                                | hosting'de yalnız MySQL var; üyelik güvenliği PostgreSQL'in satır düzeyi yetkilerine (RLS) dayanıyor, MySQL'e taşımak o güvenceyi kaldırırdı |
| paket                        | GitHub "cpanel-latest" sürümü (CI yeşilse `main`'den otomatik)   | sunucuda derleme yok: 2 GB bellek sınırında `next build` güvenilir değil                                                                       |

Paket CI'da her seferinde **Passenger altında boş bir veritabanıyla açılıp** smoke ve uçtan uca kabul testinden geçer. Kurulum aşağıda ~30 dakika sürer.

---

## 0. ön kontrol (cPanel → Terminal, 2 dk)

```bash
ldd --version | head -1
ls /opt/alt | grep -i nodejs
timeout 5 bash -c '</dev/tcp/portquiz.net/5432' && echo "5432 açık" || echo "5432 kapalı"
```

| satır                | iyi                                     | değilse                                                                                                                                 |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ldd` (glibc)        | 2.28 ve üstü                            | 2.17 de çalışır; yalnız davetiye görselinin JPEG'i yerel kütüphane yerine WebAssembly ile üretilir (birkaç saniye yavaş)               |
| `nodejs` sürümleri   | `alt-nodejs22` (ya da 20, 24)           | 20.9'dan eski ise destekle konuş                                                                                                         |
| 5432                 | `5432 açık`                             | destek talebi aç: _"hesabımdan dışarıya TCP 5432 (PostgreSQL) bağlantısına izin verir misiniz? hedef: `*.eu-central-1.aws.neon.tech`"_ — ya da §9 |

---

## 1. veritabanı: Neon (ücretsiz)

1. [neon.tech](https://neon.tech) → GitHub hesabınla kaydol (kart istemez).
2. **New project** → ad: `bagliksociety` · Postgres **16** (17 de olur) · bölge **AWS Europe Central 1 (Frankfurt)**.
3. **Connect** → "Connection pooling" **kapalı** (doğrudan bağlantı) → bağlantı adresini kopyala. Biçimi: `postgresql://KULLANICI:ŞİFRE@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require…`
4. Adresteki `sslmode=require` kısmını **`sslmode=verify-full`** yap (sunucu sertifikası da doğrulanır). Sonda `channel_binding=require` varsa kalabilir; uygulama onu kendisi ayıklar.
5. Adresi parola yöneticine kaydet. Sohbete, e-postaya, ekran görüntüsüne koyma.
6. Terminal'de yalnız **sunucu adıyla** (şifresiz kısım) portu bir kez daha dene:
   ```bash
   timeout 5 bash -c '</dev/tcp/ep-XXXX.eu-central-1.aws.neon.tech/5432' && echo açık || echo kapalı
   ```

Neon'un ücretsiz planı: 0,5 GB alan (kulüp için yıllarca yeter), 5 dk boşta kalınca uyur — uykudan sonraki ilk istek ~1 sn gecikir.

---

## 2. alt alan adı ve SSL

1. cPanel → **Domains / Alan Adları** → **Create a New Domain** → `bagliksociety.cag.la`. "Share document root" işaretini **kaldır**; belge kökü `bagliksociety.cag.la` kalsın (paketi **oraya koymayacağız**).
2. cPanel → **Let's Encrypt SSL** (ya da SSL/TLS Status → Run AutoSSL) → `bagliksociety.cag.la` için sertifika al.
3. Domains listesinde `bagliksociety.cag.la` için **Force HTTPS Redirect**'i aç.

---

## 3. gizli değerleri üret (bir kez)

Terminal'de:

```bash
for n in AUTH_PEPPER APP_ENCRYPTION_KEY; do echo "$n=$(openssl rand -base64 32)"; done
for n in CRON_SECRET SETUP_TOKEN; do echo "$n=$(openssl rand -hex 24)"; done
clear
```

Dört satırı parola yöneticine kopyala, sonra `clear`. **`AUTH_PEPPER` ve `APP_ENCRYPTION_KEY` bir kez üretilir, asla değişmez ve kaybedilmez**: ilki değişirse bütün üye anahtarları, ikincisi değişirse yöneticilerin ikinci doğrulaması geçersiz olur.

---

## 4. Node.js uygulamasını oluştur

cPanel → **Setup Node.js App** → **CREATE APPLICATION**

| alan                         | değer                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js version              | **22.x** (yoksa 24.x ya da 20.x)                                                              |
| Application mode             | **Production** — _Development seçme_: hata sayfası ortam değişkenlerini gösterebilir         |
| Application root             | `bagliksociety`                                                                               |
| Application URL              | `bagliksociety.cag.la` (yol boş)                                                              |
| Application startup file     | `app/server.js`                                                                               |
| Passenger log file (varsa)   | `/home/KULLANICI_ADIN/bagliksociety/logs/passenger.log`                                       |

**Environment variables** → ADD VARIABLE ile tek tek (değerler parola yöneticinden):

| ad                   | değer                                                            |
| -------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`       | §1'deki Neon adresi (`sslmode=verify-full`)                      |
| `AUTH_PEPPER`        | §3                                                               |
| `APP_ENCRYPTION_KEY` | §3                                                               |
| `CRON_SECRET`        | §3                                                               |
| `SETUP_TOKEN`        | §3 — kurucu oluşunca **silinecek** (§6)                          |
| `APP_ORIGIN`         | `https://bagliksociety.cag.la`                                   |
| `MIGRATE_ON_BOOT`    | `1` — her açılışta şemayı ve başlangıç içeriğini günceller       |
| `DB_POOL_MAX`        | `3` (isteğe bağlı; paylaşımlı hosting için yeterli)              |

**CREATE**. "Run NPM Install" düğmesine **basma**: paket bağımlılıklarını kendisi getirir (`app/node_modules`; CloudLinux kök klasörde `node_modules` istemediği için alt klasörde).

---

## 5. istemci adresi ayarı (.htaccess, 2 dk)

Giriş denemeleri IP başına sınırlanır. Passenger uygulamaya ziyaretçinin adresini vermez, ziyaretçinin kendi uydurduğu başlıkları ise olduğu gibi geçirir (yerelde Passenger ile ölçüldü). Adresi sunucunun yazması için:

cPanel → **File Manager** → Settings → "Show Hidden Files" → `bagliksociety.cag.la/.htaccess` → Edit. CloudLinux'un `DO NOT REMOVE` bloklarına **dokunmadan**, dosyanın **en altına** ekle:

```apache
# bağlık.society: istemci adresini sunucu yazar, ziyaretçi uyduramaz
<IfModule mod_setenvif.c>
  SetEnvIf Remote_Addr "^(.*)$" BS_CLIENT_IP=$1
</IfModule>
<IfModule mod_headers.c>
  RequestHeader unset X-Forwarded-For
  RequestHeader set X-Real-IP "%{BS_CLIENT_IP}e"
</IfModule>
```

Doğrulaması §6'nın sonunda (masa → güvenlik).

---

## 6. paketi kur, ilk kurucuyu oluştur

Terminal'de:

```bash
cd ~/bagliksociety
curl -fsSLO https://github.com/projectcagla/baglik.society/releases/download/cpanel-latest/guncelle.sh
bash guncelle.sh
```

Beklenen çıktı: `kuruldu: <commit> <tarih>` → `sağlık: tamam — https://bagliksociety.cag.la`. İlk açılış veritabanını hazırlar (tablolar, iki film, 2. gece; kaynaklar **taslak**), 10–30 sn sürebilir.

Sonra tarayıcıda:

1. `https://bagliksociety.cag.la/kurulum` → kurulum anahtarı: `SETUP_TOKEN` → adın → **kurucuyu oluştur** → çıkan tek kullanımlık kodla kapıdan gir → **kişisel anahtarını** parola yöneticine kaydet.
2. masa → üyeler → **ikinci doğrulama** kurulumu (Google Authenticator, 1Password vb.).
3. cPanel → Setup Node.js App → `SETUP_TOKEN` değişkenini **sil** → SAVE → **RESTART**. `/kurulum` artık kapıya döner.
4. masa → güvenlik sayfasının altında "sunucunun bu bağlantıda gördüğü adres" yazar. Kendi internet adresinle aynıysa §5 çalışıyor; `yok` ya da `(null)` görürsen §5'teki bloğu kontrol et (ya da hosting desteğine `mod_headers`/`mod_setenvif` açık mı diye sor).
5. Kendi bilgisayarından (repo klasöründe) dışarıdan kontrol: `npm run smoke -- https://bagliksociety.cag.la` → 20 kontrol geçmeli.

İçerik (kaynak onayı, yeni gece, üyeler) için: `docs/PRODUCTION_RUNBOOK.md` §4. 27 Eylül gecesi geçtiği için sıradaki geceyi masa → geceler → **yeni gece** ile oluştur.

---

## 7. günlük işletme

| iş                     | nasıl                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| güncelleme             | `cd ~/bagliksociety && bash guncelle.sh` — `main` her yeşil olduğunda yeni paket yayımlanır; aynı sürümse "zaten güncel" der                                                              |
| geri alma              | `bash guncelle.sh geri` — bir önceki kuruluma döner. Şema geri alınmaz: yeni sürüm bir migrasyon getirdiyse önce `db/rollback/` ve runbook §6'ya bak                                                                                   |
| yeniden başlatma       | Setup Node.js App → RESTART, ya da `touch ~/bagliksociety/tmp/restart.txt`                                                                                                               |
| kayıtlar               | Passenger log dosyası (§4) ya da `~/bagliksociety/stderr.log`. `[açılış]` satırları migrasyon/seed adımlarını yazar; hiçbir değer, kod ya da adres yazılmaz                              |
| sağlık                 | `https://bagliksociety.cag.la/api/health` → `{"status":"ok"}`; veritabanına ulaşamazsa 503                                                                                                |
| yedek                  | önemli bir değişiklikten önce Neon → **Branches → Create branch** (anlık kopya; ücretsiz planda dal sayısı sınırlı). Neon ayrıca kısa süreli zamanda geri dönüş tutar. JetBackup Neon'u **kapsamaz** |
| gizli değer değişimi   | yalnız `CRON_SECRET`/`SETUP_TOKEN` serbestçe değişir; Neon şifresini sıfırlarsan `DATABASE_URL`'i güncelle → RESTART                                                                      |

**Bağlantı denetimi (isteğe bağlı, günde bir):** kaynak bağlantılarının hâlâ açıldığını denetler, sonucu masa → bağlantılar'da görürsün.

```bash
read -rsp "CRON_SECRET: " s; printf '%s\n' "$s" > ~/.bagliksociety-cron; unset s; chmod 600 ~/.bagliksociety-cron; echo
```

(değer ekranda ve komut geçmişinde görünmez) → cPanel → **Cron Jobs** → Once Per Day, dakika `17`, saat `4` → komut:

```
bash $HOME/bagliksociety/baglanti-kontrol.sh > /dev/null
```

---

## 8. depo görünürlüğü ve paket

`guncelle.sh` paketi GitHub sürümünden **anonim** indirir; bu, depo açık olduğu sürece çalışır (şu an açık). Depoyu özel yaparsan (runbook §0, karar A): GitHub'da oturum açıkken **Releases → cpanel-latest**'ten `bagliksociety-cpanel.tar.gz` ve `.sha256` dosyalarını indir → File Manager ile `~/bagliksociety`'ye yükle → `bash guncelle.sh dosyadan`.

---

## 9. 5432 kapalıysa ve açılmıyorsa

Aynı ücretsiz yol, uygulama Vercel'de: `docs/PRODUCTION_RUNBOOK.md` (Vercel + Neon). Alan adı yine senin: cPanel → **Zone Editor** → `cag.la` → **CNAME** `bagliksociety` → `cname.vercel-dns.com`, Vercel projesinde Domains → `bagliksociety.cag.la`. §2'deki alt alan adını ve §4'teki uygulamayı bu durumda silebilirsin.

---

## sorun giderme

| belirti                                                  | olası neden → çözüm                                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "We're sorry, but something went wrong" (Passenger)      | uygulama açılamadı → log (§7): `eksik veya geçersiz ortam değişkenleri: …` adları yazar; eksikleri §4'te ekle → RESTART                        |
| log'da `ECONNREFUSED`/`ETIMEDOUT` … `5432`               | çıkış portu kapalı → §0 destek talebi ya da §9                                                                                                  |
| log'da `self-signed certificate` / `unable to verify`    | `sslmode=verify-full` bu yolda doğrulanamadı → `sslmode=require` ile dene (şifreleme sürer, yalnız sertifika doğrulanmaz)                        |
| log'da `password authentication failed`                  | `DATABASE_URL` yanlış kopyalandı ya da Neon şifresi sıfırlandı                                                                                  |
| sayfalar açılıyor, girişte "çok fazla deneme"             | §5 uygulanmamış olabilir: herkes tek adresten geliyor görünür → §6/4'teki kontrol                                                               |
| `guncelle.sh`: `checksum did NOT match`                  | indirme bozuk ya da yarım; hiçbir şey değişmedi → tekrar dene                                                                                   |
| güncellemeden sonra hata                                 | `bash guncelle.sh geri`, sonra log'u incele                                                                                                     |
