# Disaster Recovery Runbook — Dompis v2

## 1. MySQL Connection Saturation

**Symptoms:**
- `ETIMEDOUT` or `ECONNREFUSED` in worker logs
- `ER_CON_COUNT_ERROR: Too many connections` from Prisma
- Health endpoint shows `status: degraded`

**Immediate:**
```sh
# Check active connections
mysqladmin -u root -p processlist | grep -c "^|"

# Kill long-running queries (>60s)
mysql -u root -p -e "SHOW FULL PROCESSLIST" | awk '$6 > 60 { print $1 }' | xargs -I{} mysql -u root -p -e "KILL {};"
```

**Permanent fix:**
1. Verify `PRISMA_CONNECTION_LIMIT` in ecosystem.config.js — total across all workers should not exceed MySQL `max_connections`.
2. Restart affected workers: `pm2 restart <worker-name>`

---

## 2. Worker Circuit Breaker Open

**Symptoms:**
- Logs show `"X circuit open"` every cycle
- Metrics endpoint shows `circuit_open=1` for that worker

**Recovery:**
```sh
# Check error history
pm2 logs <worker-name> --lines 50

# Reset state: restart the worker
pm2 restart <worker-name>

# If opens again immediately, check:
# 1. MySQL connectivity (see Section 1)
# 2. Redis connectivity (see Section 3)
# 3. External DB connectivity (see Section 4)
```

---

## 3. Redis Down / Connection Lost

**Symptoms:**
- `connect ECONNREFUSED 127.0.0.1:6379`
- Locks not acquired, heartbeat missing
- Workers run but without locking — potential duplicate processing

**Recovery:**
```sh
# Check Redis status
redis-cli ping

# Restart Redis
sudo systemctl restart redis

# After Redis is back, restart all workers so locks are re-established
pm2 restart all --update-env
```

**Impact during downtime:** Workers continue processing but without distributed locking. Duplicate processing is possible but data integrity is maintained (checkpoint/projection_log idempotency).

---

## 4. External Database Unreachable

**Symptoms:**
- `getConnection() ETIMEDOUT` from `lib/external-db/connection.ts`
- Ingestion reports `syncStatus: error`
- `dompis_external_db_connected 0` in metrics

**Recovery:**
```sh
# Test connectivity
mysql -h $EXTERNAL_DB_HOST -u $EXTERNAL_DB_USER -p -e "SELECT 1"

# If VPN tunnel required:
# Check tunnel status
ps aux | grep ssh | grep $EXTERNAL_DB_HOST

# Restart tunnel if needed
ssh -f -L 3307:$EXTERNAL_DB_HOST:3306 bastion -N
```

**Impact:** Ingestion stops. Projection continues (processes existing `ticket_raw` records). Status-refresh and active-refresh continue (work on `ticket` table, not external). No data loss — external DB is read-only source.

---

## 5. Full Disk / PM2 OOM

**Symptoms:**
- Workers crash with `process.exit(1)` without explicit error
- PM2 shows `errored` status
- Kernel OOM killer logs in `dmesg`

**Recovery:**
```sh
# Check memory usage
pm2 monit

# Check OOM killer
dmesg | grep -i oom

# Restart with increased memory (update ecosystem.config.js max_memory_restart)
pm2 restart <worker-name>

# If persistent, reduce PRISMA_CONNECTION_LIMIT for that worker
```

---

## 6. Data Divergence (External vs Internal)

**Symptoms:**
- Daily reconciliation alert: `"Data Divergence: <table>"`
- `diff` exceeds 10% threshold

**Investigation:**
```sh
# Manual recount
node -e "
  const { fetchTableCount } = require('./lib/external-db/connection');
  const { prisma } = require('./app/libs/prisma');
  Promise.all([
    fetchTableCount('external_table_name'),
    prisma.ticket_raw.count({ where: { sourceTable: 'external_table_name' } }),
  ]).then(console.log);
"

# Check last ingestion checkpoint
redis-cli get "ingestion:checkpoint:external_table_name"
```

**Resolution:**
1. If external < internal: records were deleted externally. Run projection full scan to clean up.
2. If external > internal: records missed during ingestion. Verify checkpoint cursor is not stale (`redis-cli get "ingestion:checkpoint:external_table_name"` and compare `lastModifiedAt`).
3. If checkpoint stale (>24h): ingestion cursor resets automatically. Monitor next run.
4. If discrepancy persists: manually trigger full re-ingestion by deleting checkpoint and restarting ingestion worker.

---

## 7. Projection Never Completes

**Symptoms:**
- `projectionNeverProjected` grows continuously in health endpoint
- Projection worker logs show `processed: 0` repeatedly

**Recovery:**
```sh
# Check checkpoint progress
redis-cli get "projection:checkpoint"

# Restart projection worker
pm2 restart projection-worker

# If still stuck, run full scan projection manually
# Wait for 02:00 cron or trigger via:
redis-cli publish "worker:projection:request" "full"
```

---

## 8. Prisma Schema Mismatch

**Symptoms:**
- `PrismaClientKnownRequestError: P2021` (table not found)
- Migration error on deploy

**Recovery:**
```sh
# Apply pending migrations
npx prisma migrate deploy

# If schema drift, reset and re-apply
npx prisma migrate reset --force  # WARNING: drops data
```

---

## 9. PM2 Process Crash / All Workers Down

**Symptoms:**
- Health endpoint unreachable
- No heartbeats in Redis (`worker:heartbeat:*` keys empty)

**Recovery:**
```sh
# Check PM2 status
pm2 status

# Restart ecosystem
pm2 start ecosystem.config.js

# If PM2 daemon is dead:
pm2 kill
pm2 resurrect
```

---

## 10. Graceful Shutdown Sequence

When doing planned maintenance:

```sh
# 1. Stop ops-worker (stop scheduled tasks)
pm2 stop ops-worker

# 2. Wait for in-flight ingestion to finish (check `worker:heartbeat:ingestion-worker`)
# 3. Stop ingestion
pm2 stop ingestion-worker

# 4. Wait for projection to drain
pm2 stop projection-worker

# 5. Stop remaining workers
pm2 stop status-refresh-worker active-refresh-worker

# 6. Do maintenance
# 7. Start workers in reverse order:
pm2 start status-refresh-worker active-refresh-worker
pm2 start projection-worker
pm2 start ingestion-worker
pm2 start ops-worker
```

---

## Key Redis Keys for Debugging

| Key Pattern | Purpose |
|---|---|
| `worker:heartbeat:*` | Worker liveness |
| `distributed:lock:*` | Active locks |
| `ingestion:checkpoint:*` | Ingestion cursor per table |
| `projection:checkpoint` | Projection cursor |
| `sync-metrics:*` | Sync/projection counters |
| `slo:runs:*` | SLO run history |
| `slo:lag:*` | Per-worker lag |
| `alert:debounce:*` | Active alert debounce timers |
| `active-refresh:metrics` | Active refresh stats |
| `status-refresh:metrics` | Status refresh stats |
| `dlq:retries:*` | DLQ retry counters |
