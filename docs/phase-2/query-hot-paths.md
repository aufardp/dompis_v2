# Query Hot Paths

## Dashboard and API

### 1. Daily board
- File: `app/libs/services/daily-ticket.service.ts`
- Query:
  - `ticket.count(where)`
  - `ticket.count(validasiWhere)`
  - `ticket.findMany(where)`
  - `ticket.findMany(validasiWhere)`
- Risk:
  - 4 query per request
  - `reported_date` masih string
  - validasi board menambah count dan page query sendiri

### 2. Ticket listing / semesta
- File: `app/libs/services/tickets.service.ts`
- Query:
  - `ticket.count(where)`
  - `ticket.findMany(where)`
  - `ticket.groupBy(...)` untuk analytics
- Risk:
  - search sebelumnya terlalu banyak `contains`
  - sorting berdasarkan `reported_date` string
  - analytics tetap berat jika date range besar

### 3. Operations summary
- File: `app/api/dashboard/operations-summary/route.ts`
- Query:
  - raw SQL summary utama
  - raw SQL B2C summary
  - raw SQL B2B group summary
  - raw SQL service area summary
- Risk:
  - sangat sensitif ke index `sync_date`, `status_update`, `customer_type`, `jenis_tiket_1`, `jenis_tiket_2`, `workzone`

### 4. Search API
- File: `app/api/tickets/search/route.ts`
- Query:
  - `TicketService.search`
  - `TicketService.searchByContactName`
  - `TicketService.searchByServiceNo`
- Risk:
  - frekuensi tinggi
  - perlu jalur exact/prefix untuk manfaat index

## Worker

### 5. Ingestion write path
- File: `lib/ingestion/index.ts`
- Query:
  - `ticket_raw.findMany(where incident IN (...))`
  - bulk `INSERT ... ON DUPLICATE KEY UPDATE`
  - `ingestion_checkpoint.update`
- Risk:
  - write-heavy
  - sensitif ke deadlock dan lock wait

### 6. Projection fetch path
- File: `lib/projection/index.ts`
- Query:
  - `ticket_raw.findMany` by `importedAt + id_ticket`
  - `ticket.findMany` by `incident IN (...)`
  - `ticket.upsert`
- Risk:
  - sensitif ke cursor index pada `ticket_raw`
  - sensitif ke `incident` unique lookup pada `ticket`

### 7. Status refresh
- File: `lib/status-refresh.ts`
- Query:
  - raw SQL candidate query dari `status_refresh_ticket_state` join `ticket_raw`
  - raw SQL upsert balik ke `ticket_raw`
- Risk:
  - sensitif ke `idx_ticket_raw_status_refresh`
  - sensitif ke `status_refresh_ticket_state(lastCheckedAt, incident)`

### 8. Active refresh
- File: `lib/active-refresh.ts`
- Query:
  - join `ticket` dan `ticket_raw`
  - updateMany `ticket`
- Risk:
  - sensitif ke `ticket.incident`
  - sensitif ke `ticket_raw.incident`
