# Plan: Fix Status Category Mismatch for 'escalated' Tickets

## Problem

User reports anomaly in Proactive bucket:
- Total: 25517
- Open: 25515
- Assigned: 5
- Expected Open: 25512 (Total - Assigned)

The mismatch is caused by `buildStatusCategorySql()` not recognizing `status_update = 'escalated'` as a non-open category. Tickets with `status_update = 'escalated'` fall into the `ELSE 'open'` branch, inflating the Open count.

## Root Cause

There are TWO different SQL functions for categorizing ticket status:

### 1. `buildStatusCategorySql()` (used in `countStatusesAndCustomerTypes` → `getDailyTicketTable` → main API)
```sql
CASE
  WHEN status IN (close_statuses) THEN 'close'
  WHEN status_update = 'assigned' THEN 'assigned'
  WHEN status_update = 'on_progress' THEN 'on_progress'
  WHEN status_update = 'pending' THEN 'pending'
  ELSE 'open'  -- 'escalated' falls here!
END
```

### 2. `buildDailySummarySql()` (used in `getDailyTicketSummary` → other APIs)
```sql
CASE
  WHEN status IN (close_statuses) THEN 'close'
  WHEN status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 'assigned'
  WHEN status_update = 'on_progress' THEN 'on_progress'
  WHEN status_update = 'pending' THEN 'pending'
  WHEN status_update NOT IN (...) OR status_update IS NULL THEN 'open'
END
```

The rest of the codebase (`operations-summary`, `rekap-workorder`, etc.) already treats 'escalated' as assigned:
```sql
status_update IN ('assigned', 'on_progress', 'pending', 'escalated')
```

Only `buildStatusCategorySql()` is inconsistent.

## Fix

Update `buildStatusCategorySql()` in `daily-ticket.service.ts:888-903` to include 'escalated' in the 'assigned' category:

```sql
CASE
  WHEN UPPER(TRIM(COALESCE(status, ''))) IN (close_statuses) THEN 'close'
  WHEN LOWER(TRIM(COALESCE(status_update, ''))) IN ('assigned', 'escalated') THEN 'assigned'
  WHEN LOWER(TRIM(COALESCE(status_update, ''))) = 'on_progress' THEN 'on_progress'
  WHEN LOWER(TRIM(COALESCE(status_update, ''))) = 'pending' THEN 'pending'
  ELSE 'open'
END
```

This is a minimal change:
- Adds 'escalated' to 'assigned' category
- Preserves 'on_progress' and 'pending' as separate categories
- Maintains backward compatibility with existing code that combines them in the API response

## Verification

After the fix:
- Tickets with `status_update = 'escalated'` will be counted as 'assigned' instead of 'open'
- API response `summary.assigned` = DB assigned + DB onProgress + DB pending + DB escalated
- Summary cards will show: Total = Open + Assigned + Close
- Open will decrease by the number of 'escalated' tickets
- Assigned will increase by the number of 'escalated' tickets

## File to Change

- `app/libs/services/daily-ticket.service.ts` — update `buildStatusCategorySql()` at line 888
