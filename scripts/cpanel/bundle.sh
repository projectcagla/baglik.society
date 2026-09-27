#!/usr/bin/env bash
# Builds the self-contained package for cPanel "Setup Node.js App" (Passenger).
#   npm run bundle:cpanel   →  dist/bagliksociety-cpanel.tar.gz (+ .sha256, guncelle.sh)
#
# Layout (unpacked into the Node.js app root, e.g. ~/bagliksociety):
#   app/server.js     startup file (Next.js standalone server)
#   app/node_modules  traced runtime dependencies — kept under app/ because
#                     CloudLinux reserves node_modules in the app root itself
#   app/db/migrations applied at start (MIGRATE_ON_BOOT=1)
#   app/SURUM         commit and build time
#   guncelle.sh       server-side updater (docs/CPANEL_KURULUM.md)
#   baglanti-kontrol.sh  daily link check for cPanel cron
set -euo pipefail
cd "$(dirname "$0")/../.."

out=dist/cpanel
pkg=dist/bagliksociety-cpanel.tar.gz
rm -rf .next "$out" "$pkg" "$pkg.sha256" dist/guncelle.sh

BUILD_STANDALONE=1 npx next build

mkdir -p "$out"
cp -a .next/standalone "$out/app"
cp -a .next/static "$out/app/.next/static"
cp -a public "$out/app/public"
mkdir -p "$out/app/db/migrations"
cp -a db/migrations/. "$out/app/db/migrations/"
cp scripts/cpanel/guncelle.sh scripts/cpanel/baglanti-kontrol.sh "$out/"
chmod +x "$out/guncelle.sh" "$out/baglanti-kontrol.sh"
printf '%s %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo yerel)" \
  "$(date -u +%Y-%m-%dT%H:%MZ)" > "$out/app/SURUM"

# Nothing from a developer machine rides along: no env files, no connection
# strings, no local caches.
find "$out" -name '.env*' -print -delete
rm -rf "$out/app/.next/cache"
if grep -rIl --exclude-dir=node_modules -e 'postgres://' -e 'postgresql://' "$out" >/dev/null; then
  echo "bundle: a connection string was found in the package — refusing" >&2
  exit 1
fi
for f in app/server.js app/.next/BUILD_ID app/.next/static app/public/brand \
  app/db/migrations/0001_init.sql app/node_modules/next app/node_modules/@node-rs/argon2 \
  app/node_modules/sharp; do
  [ -e "$out/$f" ] || { echo "bundle: missing $f" >&2; exit 1; }
done

tar -czf "$pkg" -C "$out" app guncelle.sh baglanti-kontrol.sh
(cd dist && sha256sum "$(basename "$pkg")" > "$(basename "$pkg").sha256")
# first install downloads the updater on its own (docs/CPANEL_KURULUM.md)
cp scripts/cpanel/guncelle.sh dist/guncelle.sh
echo "bundle: $pkg ($(du -h "$pkg" | cut -f1)), $(cat "$out/app/SURUM")"
