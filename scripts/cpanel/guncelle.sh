#!/usr/bin/env bash
# bağlık.society — cPanel güncelleyici. Node.js uygulamasının kök klasöründe
# (ör. ~/bagliksociety) cPanel Terminal'den çalıştırılır:
#
#   bash guncelle.sh         son paketi indirir, özetini doğrular, kurar,
#                            uygulamayı yeniden başlatır ve sağlığını sorar
#   bash guncelle.sh geri    bir önceki kuruluma döner
#   bash guncelle.sh dosyadan  indirmek yerine bu klasöre (Dosya Yöneticisi
#                            ile) yüklenmiş paketi ve .sha256 dosyasını kurar
#
# Gizli değer okumaz, yazmaz, yazdırmaz: ortam değişkenleri cPanel'in
# "Setup Node.js App" ekranında kalır. Ayrıntı: docs/CPANEL_KURULUM.md
{
set -euo pipefail
cd "$(dirname "$0")"

REPO="${BAGLIK_REPO:-projectcagla/baglik.society}"
TAG="${BAGLIK_TAG:-cpanel-latest}"
BASE="${BAGLIK_BASE:-https://github.com/$REPO/releases/download/$TAG}"
URL="${BAGLIK_URL:-https://bagliksociety.cag.la}"
PKG=bagliksociety-cpanel.tar.gz

restart() {
  mkdir -p tmp
  touch tmp/restart.txt
  # CloudLinux: also ask the selector; harmless where it is missing
  if command -v cloudlinux-selector >/dev/null 2>&1; then
    cloudlinux-selector restart --json --interpreter nodejs \
      --app-root "${PWD#"$HOME"/}" >/dev/null 2>&1 || true
  fi
}

wait_healthy() {
  echo "açılış bekleniyor (ilk açılışta veritabanı hazırlanır)…"
  for _ in $(seq 1 30); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL/api/health")" = 200 ]; then
      echo "sağlık: tamam — $URL"
      return 0
    fi
    sleep 3
  done
  echo "sağlık yanıtı gelmedi. stderr.log dosyasına bakın; geri dönmek için: bash guncelle.sh geri" >&2
  return 1
}

if [ "${1:-}" = geri ]; then
  [ -d app.onceki ] || { echo "önceki kurulum yok" >&2; exit 1; }
  rm -rf app.bozuk
  mv app app.bozuk
  mv app.onceki app
  rm -rf app.bozuk
  restart
  echo "önceki kuruluma dönüldü: $(cat app/SURUM 2>/dev/null || echo bilinmiyor)"
  wait_healthy
  exit $?
fi

work="$(mktemp -d "$PWD/.guncelle.XXXXXX")"
trap 'rm -rf "$work"' EXIT
if [ "${1:-}" = dosyadan ]; then
  [ -f "$PKG" ] && [ -f "$PKG.sha256" ] ||
    { echo "$PKG ve $PKG.sha256 bu klasörde olmalı" >&2; exit 1; }
  echo "yerel paket: $PWD/$PKG"
  cp "$PKG" "$PKG.sha256" "$work/"
else
  echo "indiriliyor: $BASE"
  curl -fsSL --retry 3 -o "$work/$PKG" "$BASE/$PKG"
  curl -fsSL --retry 3 -o "$work/$PKG.sha256" "$BASE/$PKG.sha256"
fi
(cd "$work" && sha256sum -c --quiet "$PKG.sha256")
mkdir "$work/yeni"
tar -xzf "$work/$PKG" -C "$work/yeni"
[ -f "$work/yeni/app/server.js" ] || { echo "paket beklenen yapıda değil" >&2; exit 1; }

if [ -f app/SURUM ] && cmp -s app/SURUM "$work/yeni/app/SURUM"; then
  echo "zaten güncel: $(cat app/SURUM)"
  exit 0
fi

rm -rf app.onceki
[ -d app ] && mv app app.onceki
mv "$work/yeni/app" app
# replace the scripts by rename, never in place (bash is still reading this one)
mv "$work/yeni/baglanti-kontrol.sh" baglanti-kontrol.sh
mv "$work/yeni/guncelle.sh" guncelle.sh
restart
echo "kuruldu: $(cat app/SURUM)"
wait_healthy
exit $?
}
