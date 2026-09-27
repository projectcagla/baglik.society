#!/usr/bin/env bash
# bağlık.society — kaynak bağlantılarını denetletir; cPanel "Cron İşleri"nden
# günde bir kez çalıştırılır (docs/CPANEL_KURULUM.md):
#   bash $HOME/bagliksociety/baglanti-kontrol.sh
# CRON_SECRET, ~/.bagliksociety-cron dosyasında durur (chmod 600). Değer ne
# cron satırına ne de süreç listesine yazılır: curl başlığı stdin'den okur.
set -euo pipefail
URL="${BAGLIK_URL:-https://bagliksociety.cag.la}"
secret_file="$HOME/.bagliksociety-cron"
[ -r "$secret_file" ] || { echo "sır dosyası yok: $secret_file" >&2; exit 1; }
secret="$(tr -d '\r\n ' < "$secret_file")"
printf 'url = "%s/api/cron/link-check"\nheader = "Authorization: Bearer %s"\n' "$URL" "$secret" |
  curl -fsS --max-time 90 -K -
echo
