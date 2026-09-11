#!/bin/bash
# Build di Mac lokal (57Gi) lalu rsync ke VPS — 0 spike di CT 200
# Jalankan di Mac (SATU BARIS, jangan enter dulu):
#   ./scripts/build-local-rsync.sh root@192.168.88.4:/www/wwwroot/dompis_v2
set -e
DEST=${1:-}
if [ -z "$DEST" ]; then
  echo "Usage: $0 user@host:/path"
  echo "Contoh: $0 root@192.168.88.4:/www/wwwroot/dompis_v2"
  echo -n "Masukkan tujuan (user@host:/path): "
  read DEST
fi
if [ -z "$DEST" ]; then
  echo "Tujuan kosong — batal"
  exit 1
fi
echo "[1/3] Build lokal"
rm -rf .next
NPM_CONFIG_CACHE=/tmp/npm-cache npm run build
echo "[2/3] Rsync .next + dist-workers ke $DEST"
rsync -az --delete -e ssh .next/ $DEST/.next/
rsync -az --delete -e ssh dist-workers/ $DEST/dist-workers/
rsync -az -e ssh empty.ts $DEST/empty.ts 2>/dev/null || true
echo "[3/3] Reload PM2 di VPS"
ssh $(echo $DEST | cut -d: -f1) "cd $(echo $DEST | cut -d: -f2) && pm2 startOrReload ecosystem.config.js --update-env && pm2 save"
echo "DONE"
