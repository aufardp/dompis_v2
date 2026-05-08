#!/bin/bash
set -e

echo "==> Building..."
npm run build

echo "==> Copying assets..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp .env.production .next/standalone/.env

echo "==> Reloading web server (zero downtime)..."
pm2 reload web --update-env

echo "==> Restarting cron worker..."
pm2 restart cron-worker --update-env

echo "==> Done. Status:"
pm2 status