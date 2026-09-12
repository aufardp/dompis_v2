#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

WEB_APP="dompis-server"
# Sinkron dengan app names di ecosystem.config.js (dompis-ingestion-worker,
# dompis-active-refresh-worker, dompis-status-refresh-worker sudah tidak ada
# — dikonsolidasi jadi dompis-data-worker). Sebelumnya array ini basi: nama
# yang tidak ada bikin `pm2 restart` gagal, dan karena `set -e` di atas,
# seluruh sisa script (termasuk restart dompis-bridge-worker/
# dompis-snapshot-worker yang sungguhan ada, dan `pm2 save`) tidak pernah
# jalan.
WORKER_APPS=(
  "dompis-ops-worker"
  "dompis-data-worker"
  "dompis-bridge-worker"
  "dompis-projection-worker"
  "dompis-snapshot-worker"
)

echo "==> Preflight: typecheck"
npm run typecheck

echo "==> Preflight: build"
npm run build

echo "==> Reloading web app"
pm2 startOrReload ecosystem.config.js --only "$WEB_APP" --update-env

echo "==> Restarting workers sequentially"
for app in "${WORKER_APPS[@]}"; do
  echo "   -> $app"
  pm2 restart "$app" --update-env
  sleep 2
done

echo "==> Saving PM2 process list"
pm2 save

echo "==> Status"
pm2 status

echo "==> Suggested post-deploy checks"
echo "   pm2 logs $WEB_APP --lines 50"
echo "   pm2 logs dompis-data-worker --lines 50"
echo "   pm2 logs dompis-projection-worker --lines 50"
echo "   curl -f http://127.0.0.1:9005/api/health && echo 'OK'"
echo "   curl -H 'x-cron-secret: <secret>' http://127.0.0.1:9005/api/internal/workers/health"
