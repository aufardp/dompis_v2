## Production Rollout

### Scope
- Web runtime `dompis-server`
- Worker runtime:
  - `dompis-ops-worker`
  - `dompis-ingestion-worker`
  - `dompis-projection-worker`
  - `dompis-active-refresh-worker`
  - `dompis-status-refresh-worker`
- Nginx reverse proxy to `127.0.0.1:9005`

### Preflight
1. Verify backup state:
   - database backup available
   - uploaded evidence backup available
2. Verify infra health:
   - `pm2 status`
   - Redis reachable
   - MySQL reachable
3. Verify app build:
   - `npm run typecheck`
   - `npm run build`
4. Verify env:
   - `PORT=9005`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `CRON_SECRET`

### Rollout
1. Deploy code to current release directory.
2. Run:
   - `bash deploy.sh`
3. Validate web:
   - `pm2 logs dompis-server --lines 50`
   - `curl -I http://127.0.0.1:9005/login`
4. Validate workers:
   - `pm2 logs dompis-ingestion-worker --lines 50`
   - `pm2 logs dompis-projection-worker --lines 50`
   - `pm2 logs dompis-status-refresh-worker --lines 50`
5. Validate internal health:
   - `curl -H 'x-cron-secret: <secret>' http://127.0.0.1:9005/api/internal/workers/health`
   - `curl -H 'x-cron-secret: <secret>' http://127.0.0.1:9005/api/internal/health/sync`

### Verification Signals
- Immediate:
  - `dompis-server` online
  - workers online
  - `/login` returns `200`
- Short-term:
  - `/api/health` returns `ok` or `warning` without 5xx
  - worker health endpoints accessible internally
  - no startup crash loop in PM2
- Medium-term:
  - no ingestion/projection failure storm
  - projection backlog not growing abnormally
  - login, dashboard, search, assignment still work

### Rollback
1. Return code to previous release.
2. Run:
   - `pm2 startOrReload ecosystem.config.js --only dompis-server --update-env`
   - restart workers sequentially with previous build
3. Re-check:
   - `/login`
   - internal worker health
   - PM2 logs

### Nginx Notes
- Repo `nginx.conf` assumes upstream `127.0.0.1:9005`.
- TLS/certificate directives are intentionally not hardcoded here because aaPanel paths differ per host.
- Apply TLS, HSTS, and certificate binding in aaPanel vhost after confirming actual certificate paths.
