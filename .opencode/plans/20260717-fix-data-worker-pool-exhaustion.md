# Fix Data-Worker Connection Pool Exhaustion

## Problem

`seedRefreshState.datedCandidates` query on `ticket_raw` times out at 60s, exhausting the data-worker's 10-connection pool.

**Root cause:** `incident` column is NOT in covering index `idx_ticket_raw_status_refresh_seed`, forcing MySQL to do table lookups for every matching index row just to filter `incident IS NOT NULL`.

## Steps

### 1. Migration — add `incident` to covering index

**File:** `prisma/migrations/202607170000_status_refresh_seed_covering_index_v2/migration.sql`

```sql
-- Add incident to covering index so seed query needs zero table lookups.

SET @old_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_status_refresh_seed'
);

SET @drop_ddl := IF(
  @old_exists > 0,
  'DROP INDEX `idx_ticket_raw_status_refresh_seed` ON `ticket_raw`',
  'SELECT 1'
);
PREPARE drop_stmt FROM @drop_ddl;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

CREATE INDEX `idx_ticket_raw_status_refresh_seed`
  ON `ticket_raw`(`isActive`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `incident`, `status`, `sourceHash`);
```

### 2. Update `ecosystem.config.js` — pool configs

| App | Key | Before | After |
|-----|-----|--------|-------|
| dompis-data-worker | PRISMA_CONNECTION_LIMIT | 10 | **15** |
| dompis-data-worker | PRISMA_POOL_TIMEOUT | — (default 10s) | **60** |
| dompis-ops-worker | PRISMA_POOL_TIMEOUT | — | **60** |
| dompis-projection-worker | PRISMA_POOL_TIMEOUT | — | **60** |

### 3. Deploy

1. `git add -A && git commit -m "fix: add incident to ticket_raw covering index for status refresh seed"`
2. SSH ke VPS
3. Apply migration via phpMyAdmin (copy-paste migration.sql)
4. `git pull` (for ecosystem.config.js)
5. `pm2 start ecosystem.config.js` (reloads all 4 apps)

## Migration safety

`DROP INDEX` + `CREATE INDEX` on InnoDB are online DDL operations (MySQL 8.0+). No table locks.
