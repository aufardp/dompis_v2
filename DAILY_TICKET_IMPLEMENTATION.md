# Daily Ticket Table Implementation

## Overview

This document describes the implementation of the **Daily Ticket Table** feature for the Dompis v2 admin system. The feature creates an operational working board that displays only tickets relevant for daily operations while preserving historical data in the database.

## Feature Logic

The Daily Ticket Table displays tickets that match **either** of these conditions:

1. **Tickets synced today** (`sync_date = TODAY`)
2. **Tickets with pending reason** (`pending_reason IS NOT NULL AND pending_reason != ''`)

This ensures:

- Admin sees new tickets from today's spreadsheet sync
- Admin sees old tickets that still need attention (have pending reason)
- Historical data remains in database but doesn't clutter the daily view

---

## Database Schema Changes

### New Columns in `ticket` Table

```prisma
// Sync metadata fields
sync_date    DateTime?  @db.Date      // Date of sync (YYYY-MM-DD)
synced_at    DateTime?  @db.Timestamp // Timestamp of sync
import_batch String?    @db.VarChar(50) // Unique batch identifier
```

### New Indexes

```prisma
@@index([sync_date], map: "idx_sync_date")
@@index([PENDING_REASON, sync_date], map: "idx_pending_sync")
@@index([sync_date, WORKZONE], map: "idx_sync_workzone")
@@index([CUSTOMER_TYPE, sync_date], map: "idx_ctype_sync")
```

**Purpose of Indexes:**

- `idx_sync_date`: Fast filtering by sync date
- `idx_pending_sync`: Optimized query for daily ticket filter
- `idx_sync_workzone`: Combined filter for workzone + sync date
- `idx_ctype_sync`: Customer type filtering with sync date

---

## Files Created/Modified

### New Files

1. **`app/libs/services/daily-ticket.service.ts`**
   - Core service logic for daily ticket operations
   - `getDailyTicketTable()` - Main query with daily filter
   - `getDailyStats()` - Stats for daily tickets
   - `getDailyStatsByServiceArea()` - Service area breakdown

2. **`app/api/tickets/daily/route.ts`**
   - GET endpoint: `/api/tickets/daily`
   - Implements caching (30s TTL)
   - Supports all existing filters (search, workzone, dept, ticketType, etc.)

3. **`app/api/tickets/daily/stats/route.ts`**
   - GET endpoint: `/api/tickets/daily/stats`
   - Returns stats for daily tickets
   - Implements caching (60s TTL)

4. **`app/hooks/useDailyTickets.ts`**
   - React hook for fetching daily tickets
   - Client-side pagination
   - Auto-refresh support

5. **`app/hooks/useDailyTicketStats.ts`**
   - React hook for daily ticket statistics

### Modified Files

1. **`prisma/schema.prisma`**
   - Added sync metadata columns
   - Added indexes

2. **`lib/google-sheets/sync.ts`**
   - Updated to populate `sync_date`, `synced_at`, `import_batch`
   - Generates unique batch ID per sync run

3. **`app/admin/page.tsx`**
   - Replaced `useAdminTickets` with `useDailyTickets`
   - Ticket Table now uses daily ticket endpoint

4. **`app/types/ticket.ts`**
   - Added sync metadata fields to Ticket interface

---

## API Endpoints

### GET `/api/tickets/daily`

Returns paginated daily tickets.

**Query Parameters:**

- `search` - Search by INCIDENT, contact name, service number, phone
- `workzone` - Filter by workzone
- `ctype` - Filter by customer type
- `hasilVisit` - Filter by visit status
- `dept` - Filter by department (b2b/b2c)
- `ticketType` - Filter by ticket type (reguler/sqm/unspec)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3,
    "data": [
      /* tickets */
    ]
  },
  "cached": false
}
```

### GET `/api/tickets/daily/stats`

Returns statistics for daily tickets.

**Query Parameters:**

- `workzone` - Filter by workzone
- `dept` - Filter by department
- `ticketType` - Filter by ticket type
- `hasilVisit` - Filter by visit status

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 150,
    "unassigned": 25,
    "open": 50,
    "assigned": 60,
    "closed": 15,
    "byServiceArea": [
      /* service area stats */
    ]
  }
}
```

---

## Sync Process Enhancement

### Before

```typescript
// Old sync - no metadata
INSERT INTO ticket (INCIDENT, SUMMARY, ...) VALUES (...)
```

### After

```typescript
// New sync - with metadata
const syncDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
const batchId = `SYNC_${syncDate}_${Date.now()}`;

INSERT INTO ticket (
  INCIDENT, SUMMARY, ...,
  sync_date, synced_at, import_batch
) VALUES (..., syncDate, ISODateString, batchId)
ON DUPLICATE KEY UPDATE
  ...,
  sync_date = VALUES(sync_date),
  synced_at = NOW(),
  import_batch = VALUES(import_batch)
```

---

## Query Logic

### Daily Ticket Filter (SQL)

```sql
SELECT * FROM ticket
WHERE
  (sync_date = CURDATE() OR (PENDING_REASON IS NOT NULL AND PENDING_REASON != ''))
  AND WORKZONE IN (...)  -- user workzone filter
ORDER BY REPORTED_DATE DESC, id_ticket DESC
```

### Prisma Implementation

```typescript
where.OR = [
  { sync_date: todayStr },
  {
    AND: [{ PENDING_REASON: { not: null } }, { PENDING_REASON: { not: '' } }],
  },
];
```

---

## Caching Strategy

| Endpoint                   | TTL | Key Pattern                              |
| -------------------------- | --- | ---------------------------------------- |
| `/api/tickets/daily`       | 30s | `daily_tickets:{role}:{userId}:{params}` |
| `/api/tickets/daily/stats` | 60s | `daily_stats:{params}`                   |

**Cache Invalidation:**

- Automatic via TTL
- Manual refresh via `refresh()` function in hooks
- Cache is per-user (includes role and userId in key)

---

## Performance Optimizations

1. **Database Indexes**
   - Composite indexes for common query patterns
   - Covering indexes for filter columns

2. **Query Optimization**
   - Single query with OR condition
   - Efficient Prisma includes (only fetch needed relations)

3. **Caching**
   - Redis-backed caching
   - Short TTL for fresh data
   - Per-user cache keys

4. **Pagination**
   - Client-side pagination for UI
   - Server-side fetch in chunks (500 items)
   - Safety cap (200 pages max)

---

## Testing Checklist

### Sync Process

- [ ] Run manual sync (`POST /api/sync`)
- [ ] Verify `sync_date` is set to today
- [ ] Verify `synced_at` timestamp is correct
- [ ] Verify `import_batch` is unique per sync
- [ ] Check logs for batch ID

### Daily Ticket Table

- [ ] Access admin page
- [ ] Verify only today's sync + pending tickets show
- [ ] Test search functionality
- [ ] Test workzone filter
- [ ] Test dept filter (B2B/B2C)
- [ ] Test ticket type filter
- [ ] Test pagination
- [ ] Verify auto-refresh (30s interval)

### Stats

- [ ] Verify stats match ticket count
- [ ] Test with different filters
- [ ] Verify cache is working (check response time)

### Performance

- [ ] Check query execution time (< 500ms)
- [ ] Verify indexes are used (EXPLAIN query)
- [ ] Monitor cache hit rate
- [ ] Test with large dataset (1000+ tickets)

---

## Troubleshooting

### Issue: No tickets showing

**Possible causes:**

1. Sync hasn't run today
2. No tickets have `pending_reason`
3. Workzone filter too restrictive

**Solution:**

```sql
-- Check if sync_date is set
SELECT COUNT(*) FROM ticket WHERE sync_date = CURDATE();

-- Check pending tickets
SELECT COUNT(*) FROM ticket
WHERE PENDING_REASON IS NOT NULL AND PENDING_REASON != '';
```

### Issue: Slow query performance

**Possible causes:**

1. Missing indexes
2. Large dataset without proper filtering

**Solution:**

```sql
-- Check index usage
EXPLAIN SELECT * FROM ticket
WHERE (sync_date = CURDATE() OR (PENDING_REASON IS NOT NULL AND PENDING_REASON != ''))
AND WORKZONE LIKE '%...%';

-- Verify indexes exist
SHOW INDEX FROM ticket;
```

### Issue: Cache not working

**Possible causes:**

1. Redis connection issue
2. Cache key mismatch

**Solution:**

```bash
# Check Redis connection
redis-cli ping

# Check cache keys
redis-cli keys "daily_tickets:*"
```

---

## Future Improvements

1. **Archive Strategy**
   - Move old tickets to archive table
   - Keep only 90 days in main table

2. **Materialized View**
   - Create view for daily ticket query
   - Refresh view on sync

3. **Real-time Updates**
   - WebSocket for live updates
   - Push notifications for new tickets

4. **Advanced Filtering**
   - Save filter presets
   - Custom filter builder

5. **Analytics**
   - Track daily ticket trends
   - Average resolution time
   - Technician performance metrics

---

## Migration Notes

### Rolling Back

If you need to revert this implementation:

```bash
# 1. Revert admin/page.tsx to use useAdminTickets
# 2. Delete new files
rm -rf app/api/tickets/daily
rm app/hooks/useDailyTickets.ts
rm app/hooks/useDailyTicketStats.ts
rm app/libs/services/daily-ticket.service.ts

# 3. Remove schema fields (requires migration)
# Remove from prisma/schema.prisma:
# - sync_date, synced_at, import_batch fields
# - Related indexes

# 4. Run migration
npx prisma migrate dev --name remove_sync_metadata
```

### Data Migration

To populate `sync_date` for existing tickets:

```sql
-- Set sync_date to reported_date for existing tickets
UPDATE ticket
SET sync_date = DATE(REPORTED_DATE),
    synced_at = NOW(),
    import_batch = 'MIGRATED_LEGACY'
WHERE sync_date IS NULL;
```

---

## Contact

For questions or issues related to this implementation, contact the development team.

**Implementation Date:** March 5, 2026  
**Version:** 1.0.0
