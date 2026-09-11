#!/bin/bash
# Build di luar CT 200 agar tidak spike 46Gi di prod
# Jalankan di Node PVE host (bukan di pct exec 200), host punya 57Gi+ free
# CT 200 rootfs ada di /var/lib/lxc/200/rootfs

set -e
CTID=200
CT_ROOT=/var/lib/lxc/200/rootfs/www/wwwroot/dompis_v2
HOST_TMP=/tmp/dompis-build-$$

echo "[1/6] Mount check"
ls -d $CT_ROOT/.git > /dev/null || { echo "CT $CTID rootfs tidak ditemukan di $CT_ROOT"; exit 1; }

echo "[2/6] Sync code dari CT ke host tmp (agar host punya deps terbaru)"
rm -rf $HOST_TMP
mkdir -p $HOST_TMP
rsync -a --delete --exclude .next --exclude dist-workers --exclude node_modules $CT_ROOT/ $HOST_TMP/

echo "[3/6] Build di host (memori host, bukan CT)"
cd $HOST_TMP
# host Node 20.20.2 sama dengan CT
NPM_CONFIG_CACHE=/tmp/npm-cache npm ci --legacy-peer-deps
rm -rf .next
NPM_CONFIG_CACHE=/tmp/npm-cache NPM_CONFIG_CACHE=/tmp/npm-cache NODE_OPTIONS=--max-old-space-size=4096 npm run build

echo "[4/6] Rsync hasil build ke CT (tanpa node_modules)"
rsync -a --delete $HOST_TMP/.next/ $CT_ROOT/.next/
rsync -a $HOST_TMP/.next/standalone/ $CT_ROOT/.next/standalone/ 2>/dev/null || true
rsync -a $HOST_TMP/dist-workers/ $CT_ROOT/dist-workers/

echo "[5/6] Reload PM2 di CT"
pct exec $CTID -- bash -c "cd /www/wwwroot/dompis_v2 && pm2 startOrReload ecosystem.config.js --update-env && pm2 save"

echo "[6/6] Cleanup"
rm -rf $HOST_TMP
echo "DONE — CT 200 tidak pernah spike 46Gi"
