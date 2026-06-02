#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

WEB_APP="dompis-server"
WORKER_APPS=(
  "dompis-ops-worker"
  "dompis-ingestion-worker"
  "dompis-projection-worker"
  "dompis-active-refresh-worker"
  "dompis-status-refresh-worker"
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
echo "   pm2 logs dompis-ingestion-worker --lines 50"
echo "   pm2 logs dompis-projection-worker --lines 50"
echo "   curl -f http://127.0.0.1:9005/api/health && echo 'OK'"
echo "   curl -H 'x-cron-secret: <secret>' http://127.0.0.1:9005/api/internal/workers/health"
