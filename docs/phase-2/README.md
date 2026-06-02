# Phase 2 Database and Query Optimization

Dokumen ini merangkum hasil kerja Phase 2 yang sudah diterapkan dan artefak yang perlu dipakai untuk batch berikutnya.

## Target

- menurunkan beban query hot path
- menekan full scan yang tidak perlu
- menyiapkan migration schema dengan aman
- menjaga worker tetap stabil saat volume tiket tinggi

## Perubahan runtime yang sudah diterapkan

1. `app/libs/services/tickets.service.ts`
   - search umum tidak lagi langsung memakai `contains` untuk semua field
   - exact match dan `startsWith` diprioritaskan untuk `incident`, `service_no`, dan `ticket_id_gamas`
   - pagination sekarang dibatasi aman `page >= 1` dan `limit <= 100`

2. `app/libs/services/daily-ticket.service.ts`
   - stats by service area sekarang memakai helper jenis tiket global
   - filter workzone service area memakai `workzone IN (...)`, bukan OR `contains`
   - mapping hasil group workzone memakai exact match, bukan substring match

## Artefak pendukung

- `docs/phase-2/query-hot-paths.md`
- `docs/phase-2/index-audit.md`
- `docs/phase-2/explain-checklist.sql`
- `docs/phase-2/datetime-migration-plan.md`
- `docs/phase-2/connection-budget.md`
- `docs/phase-2/additive-index-draft.sql`

## Batas Phase 2 saat ini

- belum ada migrasi schema dijalankan
- belum ada drop index apa pun
- belum ada cutover cursor pagination
- belum ada switch typed datetime pada tabel `ticket` dan `ticket_raw`
