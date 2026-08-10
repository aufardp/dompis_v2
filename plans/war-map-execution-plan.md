# Plan Eksekusi — War Map & Geo-Tagging Lokasi Service_No

**Sumber:** `plans/PRD-War-Map-Geo-Tagging-Gangguan.md` v1.3
**Prinsip kerja:** additive-only, feature-flagged, backward-compatible; tiap fase diakhiri `npm run typecheck` + `npm run build`.

---

## Fase P0 — Schema & Migrasi (additive)

**Tujuan:** tambah dua tabel baru, tanpa mengubah tabel existing.

- Tambah di `prisma/schema.prisma` model `service_location` + `service_location_history` (persis §7 PRD).
- Relasi: `last_ticket` → `ticket(id_ticket)`, `last_teknisi` → `users(id_user)`, `history` → cascade.
- Index: `@@index([workzone])`, `@@index([latitude, longitude])` pada `service_location`; `@@index([service_no, tagged_at])`, `@@index([workzone, tagged_at])`, `@@index([latitude, longitude])` pada `service_location_history`.
- Nama tabel/kolom sudah dicek tidak bentrok dengan 41 model existing.

**Jalankan:**
```
npx prisma generate
npx prisma migrate dev --name add_service_location
npm run typecheck
```

**Gate:** `npx prisma validate` + `npm run typecheck`.

---

## Fase P1 — Backend: validasi schema, closeTicket, route close, location-bank

**Tujuan:** close ticket menulis geolokasi + history dalam satu transaksi; harden `device_name`; endpoint bank data untuk teknisi.

1. `app/libs/validations/ticket.schema.ts` — extend `closeTicketSchema`:
   ```
   latitude?: number (-90..90)
   longitude?: number (-180..180)
   accuracyMeters?: number
   barcodeDc?: string max 150
   locationSource?: 'manual_tag' | 'reused_bank_data'
   ```
   (opsional; kewajiban di-enforce di service bila `GEOTAG_REQUIRED_ENABLED=true`).

2. `app/libs/services/ticketWorkflow.service.ts` — `closeTicket()`:
   - Tambah param object `location`: `{ latitude?, longitude?, accuracyMeters?, barcodeDc?, locationSource? }`.
   - Harden `device_name`: setelah `lockTicketRow`, cek `cleanNullableString(ticket.device_name)` — throw `'Device Name (ODP) wajib diisi'` bila kosong.
   - `geotagRequired = process.env.GEOTAG_REQUIRED_ENABLED === 'true'` — bila ON, validasi `latitude`/`longitude`/`barcodeDc` wajib diisi.
   - Setelah `tx.ticket.update` dan sebelum `createTechEvent`: `tx.service_location.upsert` (by `service_no`) + `tx.service_location_history.create`, snapshot lengkap; `source` = `locationSource ?? 'manual_tag'`; `tagged_count` increment.

3. `app/api/tickets/close/route.ts`:
   - Teruskan field baru dari body ke `validateBody` dan `closeTicket(...)`.
   - Kewajiban geolokasi di sisi service (server-side), bukan hanya skema.

4. `app/api/tickets/[id]/location-bank/route.ts` (baru):
   - `protectApi(['teknisi'])`, scoped ke ticket miliknya.
   - Query `service_location.findFirst({ where: { service_no } })`.
   - Return `{ success, found, data }` (data null bila belum ada).

**Verifikasi:** smoke test close ticket manual + `npm run build`.

---

## Fase P2 — Frontend Teknisi: LocationTagger

**Tujuan:** teknisi menandai lokasi saat close, 3-state (empty → tagging → filled) + banner konfirmasi bank data.

1. `app/teknisi/components/detail-modal/LocationTagger.tsx` (baru), meniru pola `DeviceEditor`:
   - Empty state: badge "Lokasi belum ditag" + tombol "Tag Lokasi".
   - Tagging state: tombol "Ambil Lokasi Saat Ini" → `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })`; preview mini-map Leaflet draggable marker (dynamic import, `ssr:false`); warning bila `accuracy > 100m` (non-block); scan barcode via `@yudiel/react-qr-scanner` (pola `teknisi/join/page.tsx`) + fallback input manual; nama customer & alamat read-only dari ticket.
   - Banner konfirmasi bila bank data ada (dari `/api/tickets/[id]/location-bank`): "Data Masih Benar" → auto-fill + `locationSource='reused_bank_data'`; "Ada yang Berubah" → form prefill editable + `locationSource='manual_tag'`.
   - Filled state: mini-map non-editable + nilai barcode + tombol Edit (buka ulang banner).

2. `app/teknisi/components/detail-modal/DetailTicketSection.tsx` — mount `LocationTagger` sejajar `DeviceEditor`.

3. `app/teknisi/components/TicketDetailModal.tsx`:
   - State lokasi (`latitude`, `longitude`, `accuracyMeters`, `barcodeDc`, `locationSource`) + `isLocationEmpty`.
   - `handleCloseTicket` (mulai ~line 527): validasi + blok bila `GEOTAG_REQUIRED_ENABLED=true` dan lokasi belum terisi; kirim field geo di body `/api/tickets/close`.
   - `onScrollToLocation` untuk pill; render `isLocationEmpty` ke `ModalFooter`.

4. `app/teknisi/components/detail-modal/ModalFooter.tsx`:
   - Tambah pill "Lokasi" (`key: 'lokasi'`, icon `MapPin`) di array `pills` + logika `getCloseContent`.

**Gate:** `npm run build`.

---

## Fase P3 — API War Map (backend)

**Tujuan:** endpoint bbox untuk peta.

1. `app/api/war-map/points/route.ts` (baru):
   - `enforceApiRateLimit` (namespace `war-map-points`) + `protectApi(['admin','superadmin','helpdesk','senior_leader','admin_branch'])`.
   - Query params: `bbox`(south,west,north,east), `workzone[]`, `area[]`, `status`, `from`, `to`, `hotOnly`.
   - Query `service_location` dalam bounding box (index `latitude`/`longitude`); `historyCount` per titik via agregasi `service_location_history`; `hotOnly` = filter ≥3 histori dalam 90 hari.
   - Cache Redis TTL 15-30 detik (pola `lib/cache.ts`).

2. `app/api/war-map/points/[serviceLocationId]/history/route.ts` (baru):
   - Daftar snapshot history urut `tagged_at` desc untuk popup "lihat semua histori".

3. `app/libs/sseBroadcast.ts`:
   - Tambah `broadcastWarMapUpsert(payload)` → channel `war-map:new-point`.
   - Panggil dari route close setelah sukses (sejajar `broadcastTicketInvalidate`).

**Gate:** `npm run build`.

---

## Fase P4 — Frontend War Map (admin/helpdesk)

**Tujuan:** peta + clustering + filter + popup.

1. Dependency: `leaflet`, `react-leaflet`, `supercluster`, `@types/leaflet`.

2. `app/admin/tools/war-map/page.tsx` (baru) + `components/*`:
   - Leaflet full-screen; marker cluster `supercluster`; popup: customer (masking §10), alamat, device_name, barcode DC, historyCount → link ke detail ticket.
   - Filter panel: Workzone, Area/SA, Status, Jenis Tiket, Rentang Tanggal; toggle histori vs aktif.
   - Flag `WAR_MAP_ENABLED`: jika false → halaman placeholder.

3. `middleware.ts` — di blok role guard, izinkan `pathname.startsWith('/admin/tools')` untuk role `helpdesk`.

4. `app/components/layout/Sidebar.tsx`:
   - Generalisasi jadi `ExpandableMenuGroup` reusable (label, icon, children, state expand per key) — dipakai Ticket Management + Tools.
   - Tambah menu "Tools" (icon `Wrench`) → child "War Map" (`/admin/tools/war-map`).
   - Tambah filter `MENU_ITEMS` per role (helpdesk hanya melihat menu relevan).

**Gate:** `npm run build` + smoke test login role helpdesk.

---

## Fase P5 — Realtime & Tuning (opsional, menyusul)

- Wire channel SSE `war-map:new-point` ke halaman war map (auto-refresh saat tagging baru).
- Invalidasi cache + tuning performa bbox berdasar volume riil; re-evaluasi threshold hot point bila data tersedia.

---

## Catatan Penting

- Tidak menambah kolom/index ke tabel `ticket`/`ticket_raw` — murni tabel baru.
- Injeksi `service_location` terjadi setelah update ticket, dalam satu transaksi (atomic).
- Route `/admin/tools/war-map` tunggal (shared), RBAC di dalam.
- QOSMIC Bridge, ingestion, projection tidak tersentuh (PRD §8.4).
- Semua langkah mengikuti keputusan v1.3: helpdesk prefix-only, AdminLayout+filter role, harden `device_name`, `ExpandableMenuGroup`.
