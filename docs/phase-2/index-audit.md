# Index Audit

## `ticket`

### Index yang sudah relevan
- `incident` unique
- `idx_ticket_search_service_no`
- `idx_ticket_search_contact_phone`
- `idx_ticket_search_contact_name`
- `idx_ticket_reported`
- `idx_ticket_workzone`
- `idx_status_update`
- `idx_sync_date`
- `idx_sync_status`
- `idx_sync_workzone`
- `idx_ops_sync_ctype_status`
- `idx_ops_sync_ctype_jenis2`

### Catatan risiko
- `reported_date` masih string, jadi index ada tetapi nilai performanya terbatas untuk sort/range.
- search `customer_name` masih `contains`, index biasa tidak banyak membantu.
- hasil `EXPLAIN` menunjukkan optimizer masih memilih `idx_ticket_workzone` untuk daily board, validasi board, search, dan operations summary.
- query daily dan validasi masih `Using filesort`, jadi composite index existing belum cocok dengan kombinasi `sync_date + workzone + status/status_update + reported_date`.
- search umum yang mencampur `incident/service_no/contact_phone` dalam satu OR besar cenderung membuat optimizer mengabaikan index spesifik kolom pencarian.

### Kandidat additive index
- `(sync_date, workzone, status, reported_date, id_ticket)` untuk daily board utama.
- `(sync_date, workzone, status_update, status, reported_date, id_ticket)` untuk validasi board.
- `(sync_date, workzone, status_update)` untuk operations summary dan counter close/open ringan.

### Catatan implementasi
- untuk search, rewrite query lebih prioritas daripada menambah index baru, karena jalur OR lintas kolom adalah akar utama pemilihan plan yang buruk.
- karena `reported_date` masih `VARCHAR`, index di atas adalah optimasi menengah; hasil terbaik tetap menunggu migrasi ke kolom `DATETIME`.

## `ticket_raw`

### Index yang sudah relevan
- `incident` unique
- `(sourceTable, incident)`
- `(sourceTable, sourceUpdatedAt)`
- `(importedAt, id_ticket)` projection cursor
- `(syncBatchId, importedAt, id_ticket)` projection batch cursor
- `(isActive, status, synced_at)` status refresh

### Catatan risiko
- query refresh memakai `incident`, `sourceTable`, `isActive`, `status`, `lastCheckedAt`
- write ingestion sangat sensitif terhadap jumlah index tambahan

### Kandidat additive index
- `(isActive, sourceTable, incident)`
- `(isActive, sourceTable, sourceUpdatedAt, incident)`
- `(sourceTable, isActive, lastSeenAt)`

## Supporting tables

### `status_refresh_ticket_state`
- sudah cukup baik:
  - `(lastCheckedAt, incident)`
  - `(sourceTable, lastCheckedAt)`

### `ticket_projection_log`
- cukup baik:
  - `ticketRawId` unique
  - `(importedAt, ticketRawId)`
- kandidat:
  - `(status, importedAt)`

### `tech_event_outbox`
- sudah cukup baik:
  - `(status, next_attempt_at)`
  - `(created_at)`
- kandidat:
  - `(status, created_at)` jika dashboard backlog sering dipantau

## Index yang jangan disentuh dulu
- index existing pada `ticket_raw` jangan di-drop sebelum `EXPLAIN` nyata di production/staging membuktikan redundant.
- index untuk worker write-path harus dianggap mahal; setiap tambahan index di `ticket_raw` punya biaya write.
