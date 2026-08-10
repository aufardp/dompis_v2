# PRD — War Map (Peta Sebaran Gangguan) & Geo-Tagging Lokasi Service_No
**Produk:** Dompis v2 — Telkom Akses Area 3 (Suramadu)
**Versi Dokumen:** 1.3 (Draft untuk review)
**Disusun:** berdasarkan audit langsung codebase `dompis_v2` (app, lib, prisma, scripts, worker*, middleware, server, ecosystem.config.js)
**Status:** Belum ada implementasi — fitur ini 100% baru (dikonfirmasi lewat audit, lihat §1.2)

> **Changelog v1.1:** Menegaskan alur konfirmasi eksplisit "Data Masih Benar" / "Ada yang Berubah" saat `service_no` muncul kembali (§6.1, §7). Menambah §12 — daftar ide pengembangan lanjutan menuju fitur yang lebih canggih, dirancang agar bisa dibangun di atas skema yang sama tanpa migrasi ulang.
> **Changelog v1.2:** Route dipindah ke `/admin/tools/war-map`, terintegrasi ke menu sidebar baru **"Tools"** (§6.2) — termasuk analisis struktur `Sidebar.tsx` existing dan rekomendasi implementasi expandable menu group agar siap menampung tools lain ke depannya (ODP Health §12.1, dll).
> **Changelog v1.3:** Keputusan arsitektur final setelah review kode menyeluruh — (1) akses helpdesk ke war map dibuka **hanya** pada prefix `/admin/tools/*` (bukan seluruh `/admin/*`), (2) helpdesk render `AdminLayout`/`Sidebar` yang sama dengan **filter menu per role** (bukan route terpisah, bukan clean page), (3) menambah **validasi server-side `device_name`** di `closeTicket()` (sebelumnya hanya frontend), (4) implementasi menu "Tools" memakai **generalisasi komponen `ExpandableMenuGroup`** (bukan copy-paste pola `ticketMenuExpanded`). Koreksi angka model schema: **41 model + 2 enum** (bukan 39).

---

## 1. Latar Belakang & Audit Codebase

### 1.1 Konteks

Saat ini, saat teknisi close ticket gangguan (`POST /api/tickets/close` → `TicketWorkflowService.closeTicket`), data yang wajib diisi hanya:

| Field wajib sebelum close | Sumber | Lokasi enforce |
|---|---|---|
| `alamat` (tidak boleh kosong) | `ticket.alamat` | `ticketWorkflow.service.ts:1266-1268` (server-side) |
| `device_name` (ODP) | `ticket.device_name`, diedit via `DeviceEditor.tsx` → `PATCH /api/tickets/update` | ⚠️ **saat ini hanya frontend** (`DeviceEditor.tsx:66`, `TicketDetailModal.tsx:540`) — **PRD v1.3 menambahkan validasi server-side** di `closeTicket()` agar konsisten dengan pola wajib lainnya |
| Minimal 2 evidence foto | `ticket_evidence` | `ticketWorkflow.service.ts:1270-1275` (server-side) |
| RCA + Sub RCA | `ticket.rca`, `ticket.sub_rca` | `closeTicketSchema` + `ticketWorkflow.service.ts:1241-1242` (server-side) |
| Detail perbaikan (`description_solution_dompis`, min 10 karakter) | `ticket.description_solution_dompis` | `closeTicketSchema` + `ticketWorkflow.service.ts:1244-1248` (server-side) |

Tidak ada **koordinat GPS**, **barcode DC**, atau **histori lokasi per `service_no`** yang tersimpan di manapun di sistem saat ini.

### 1.2 Hasil Audit (Phase 0) — Fakta Penting

Saya sudah menelusuri seluruh `prisma/schema.prisma` (41 model + 2 enum), `app/api/tickets/close`, `app/teknisi/components/detail-modal/*`, dan `package.json`. Temuan kunci:

1. **Tidak ada tabel geospasial sama sekali.** Tidak ada `latitude`/`longitude`/`geo` di model manapun (`ticket`, `ticket_raw`, `cluster_node`, dll). `cluster_node.odc_value` hanya string identifier ODC untuk clustering assignment teknisi — **bukan** koordinat.
2. **Tidak ada dependency map/GIS terpasang.** `leaflet`, `react-leaflet`, `mapbox-gl` **tidak ada** di `package.json` — meski disebut sebagai rencana di percakapan sebelumnya, belum pernah masuk ke `package.json` yang saya terima. Ini harus ditambahkan dari nol.
3. **Precedent UI yang sangat relevan sudah ada** dan bisa langsung dipakai sebagai pola desain:
   - `DeviceEditor.tsx` (teknisi/components/detail-modal) — pola *3-state editor* (empty → editing → filled) dengan validasi wajib-isi sebelum close. Ini pola yang tepat untuk "Location Tagger".
   - `app/teknisi/join/page.tsx` — sudah memakai `@yudiel/react-qr-scanner` (via `next/dynamic`, `ssr:false`) untuk scan QR undangan tim. Pola identik bisa dipakai untuk **scan barcode DC**.
   - `ModalFooter.tsx` — sistem "pills" checklist (`Alamat`, `Device`, `RCA`, `Detail`, `Foto`) yang men-*gate* tombol Close. Menambah pill `Lokasi` di sini adalah titik integrasi paling natural.
4. **Struktur RBAC sudah siap** — `protectApi(['admin','helpdesk', ...])` dan `normalizeRoleKey()` di middleware sudah membedakan role `admin`, `helpdesk`, `teknisi`, `superadmin`, `senior_leader`, `admin_branch`. War map admin/helpdesk tinggal menambah matcher baru.
5. **Realtime sudah ada infrastrukturnya** — `sseBroadcast.ts` + `initSSERedis` dipakai server-wide untuk invalidate cache dashboard secara live. War map bisa numpang di jalur SSE yang sama untuk marker baru muncul real-time tanpa polling.
6. **Hierarki wilayah sudah lengkap**: `region → branch → area → service_area (SA) → cluster → cluster_area → cluster_node`, plus kolom `workzone` langsung di `ticket`. Ini adalah dimensi filter alami untuk war map (per Area 3 Suramadu, per witel/branch, per SA).
7. **Tidak ada worker/queue baru yang dibutuhkan secara arsitektural.** Semua worker existing (`worker.ts` ops, `worker-data.ts`, `worker-bridge.ts`, `worker-projection.ts`, `worker-snapshot.ts`, `worker-active-refresh.ts`, `worker-status-refresh.ts`) menangani sinkronisasi data eksternal (QOSMIC bridge, ingestion, projection). Penulisan data lokasi terjadi **sinkron di dalam transaksi close ticket yang sudah ada** — tidak perlu BullMQ job baru untuk MVP.

**Kesimpulan Audit:** Fitur ini murni *additive* — tidak menyentuh pipeline QOSMIC Bridge, ingestion, atau projection yang sedang berjalan. Risiko regresi terhadap sistem existing sangat rendah **selama** implementasi mengikuti pola surgical-additive yang sudah menjadi standar kerja di proyek ini.

---

## 2. Problem Statement

Admin dan helpdesk Telkom Akses Area 3 (Suramadu) saat ini **tidak punya visibilitas spasial** terhadap sebaran gangguan aktif. Semua monitoring bersifat tabular (dashboard, bucket ticket, rekap workorder) — tidak ada cara cepat untuk melihat:

- Titik mana yang gangguannya menumpuk (indikasi masalah infrastruktur ODP/ODC, bukan per-pelanggan)
- Apakah gangguan baru berada dekat dengan riwayat gangguan `service_no` yang sama sebelumnya
- Sebaran gangguan per cluster/witel secara geografis untuk pengambilan keputusan cepat (mis. deploy teknisi tambahan ke satu titik)

Selain itu, data lokasi pelanggan (koordinat, ODP, barcode DC) **hilang setiap kali ticket ditutup** — tidak pernah terekam sebagai *aset data* yang bisa dipakai ulang untuk ticket berikutnya di `service_no` yang sama. Setiap kali gangguan berulang di pelanggan yang sama, teknisi harus mencari ulang informasi lokasi dari nol.

---

## 3. Tujuan (Goals)

1. Teknisi menandai lokasi GPS pelanggan (+ barcode DC) sebagai bagian dari proses close ticket gangguan — menjadi *source of truth* pertama.
2. Data lokasi per `service_no` disimpan sebagai **"bank data"** yang reusable — begitu pernah ditag sekali, ticket berikutnya di `service_no` yang sama otomatis punya data lokasi tanpa perlu tag ulang (kecuali ada perubahan).
3. Admin & helpdesk mendapat **War Map**: peta interaktif sebaran gangguan aktif/riwayat, dengan filter workzone/area/cluster/status/tanggal, marker clustering, dan popup detail per titik.
4. Semua histori tagging (append-only) tersimpan sehingga bisa dianalisis: apakah titik yang sama berulang kali gangguan (indikasi infrastruktur bermasalah, bukan pelanggan).

### Success Metrics (usulan)
- ≥ 90% ticket gangguan closed dalam 30 hari pertama sudah punya koordinat valid (akurasi ≤ 50m).
- War map admin/helpdesk load < 2 detik untuk area dengan ~2.000 titik aktif (lihat §8 Scalability).
- Zero regresi terhadap SLA close ticket existing (tidak menambah > 1 langkah wajib yang signifikan memperlambat teknisi di lapangan).

## 4. Non-Goals (Out of Scope MVP)

- Tidak membangun ulang GIS penuh (routing, isochrone, drive-time analysis) — cukup titik + cluster + popup.
- Tidak melakukan reverse-geocoding otomatis (alamat dari koordinat) di MVP — alamat tetap dari field `ticket.alamat` yang sudah ada.
- Tidak backfill koordinat historis — data GPS lama memang tidak pernah ada, tidak bisa direkonstruksi. War map hanya terisi progresif mulai dari hari fitur ini live.
- Tidak ada fitur assignment teknisi berbasis peta (mis. auto-assign berdasar jarak) — itu topik cluster/assign existing yang terpisah, potensial fase lanjutan.

---

## 5. Actors & Roles

| Role | Kemampuan |
|---|---|
| **Teknisi** | Wajib tag lokasi (GPS + barcode DC) saat close ticket gangguan. Bisa lihat lokasi tersimpan sebelumnya untuk `service_no` yang sama (read-only, sebagai bantuan navigasi). |
| **Admin, Superadmin, Senior Leader, Admin Branch** | Akses penuh War Map (semua workzone dalam scope-nya, sesuai `user_area`/`user_branch`/`user_region` existing). |
| **Helpdesk** | Akses War Map (read-only), untuk membantu identifikasi gangguan area saat menerima laporan pelanggan. |

Scoping wilayah **mengikuti pola yang sudah ada** di dashboard lain (`getWorkzonesForUser()` disebut di memori proyek untuk Dashboard Durasi) — War Map wajib pakai fungsi scoping yang sama, bukan reimplementasi baru.

---

## 6. User Flow

### 6.1 Teknisi — Location Tagging saat Close Ticket

Titik integrasi: `app/teknisi/components/detail-modal/` — komponen baru `LocationTagger.tsx`, ditempatkan di `DetailTicketSection.tsx` sejajar dengan `AddressEditor.tsx` dan `DeviceEditor.tsx`.

**State machine (meniru pola `DeviceEditor.tsx`):**

1. **Empty state** — badge kuning "Lokasi belum ditag", tombol "Tag Lokasi".
2. **Tagging state:**
   - Tombol **"Ambil Lokasi Saat Ini"** → panggil `navigator.geolocation.getCurrentPosition()` (bukan `watchPosition`, untuk hemat baterai), dengan `enableHighAccuracy: true`, timeout 15 detik.
   - Tampilkan preview mini-map (Leaflet, draggable marker) supaya teknisi bisa **koreksi manual** kalau GPS meleset (masalah umum di lapangan — sinyal GPS lemah di dalam rumah pelanggan).
   - Tampilkan `accuracy` (meter) dari browser; jika akurasi > 100m tampilkan warning (bukan hard-block) "Akurasi GPS rendah, mohon cek ulang titik di peta".
   - Field **Barcode DC**: tombol "Scan Barcode" membuka `@yudiel/react-qr-scanner` (dynamic import, `ssr:false`, identik pola `teknisi/join/page.tsx`) — mendukung scan barcode 1D/QR. Fallback input manual teks jika scan gagal/kamera tidak tersedia.
   - Nama Customer & Alamat **tidak diinput ulang** — auto-fill read-only dari `ticket.contact_name`/`customer_name` dan `ticket.alamat` (field yang sudah wajib diisi lebih dulu). Ini mencegah duplikasi input dan potensi typo devianttidak sinkron dengan data ticket.
   - Jika `service_no` sudah pernah punya tagging sebelumnya (bank data ada, dari kapan pun — tidak ada batas waktu) → **wajib tampilkan banner konfirmasi lebih dulu**, sebelum form tagging kosong ditampilkan sama sekali:

     > 📍 **Lokasi tersedia dari tagging sebelumnya** ({tanggal terakhir ditag}, oleh {nama teknisi terakhir})
     > Nama: {customer_name} · ODP: {device_name} · Barcode DC: {barcode_dc}
     > *(mini-map preview posisi tersimpan)*
     >
     > `[ ✓ Data Masih Benar ]`  `[ ✏️ Ada yang Berubah ]`

3. **Cabang alur dari banner konfirmasi:**
   - **Tap "Data Masih Benar"** → seluruh field (`latitude`, `longitude`, `device_name`, `barcode_dc`) langsung **auto-fill dari bank data**, tidak ada input ulang sama sekali (tidak perlu ambil GPS ulang, tidak perlu scan barcode ulang). Field lokasi otomatis berstatus "terisi", `source` ditandai `reused_bank_data`. Teknisi bisa langsung lanjut ke langkah close berikutnya (RCA/detail) — ini jalur tercepat, satu tap.
   - **Tap "Ada yang Berubah"** → form terbuka dalam mode *editing*, **semua field tetap ter-prefill dari bank data** (bukan kosong), sehingga teknisi **hanya perlu mengubah field yang benar-benar berubah** (misal cuma koordinat bergeser, ODP tetap sama; atau cuma barcode DC diganti karena penggantian modul, lokasi tetap). Field yang tidak disentuh tetap membawa nilai lama. `source` ditandai `manual_tag`.
   - Jika `service_no` **belum pernah** ada bank data (kasus pertama kali) → langsung ke form tagging kosong seperti alur awal (ambil GPS baru + scan barcode baru), `source` = `manual_tag`.
4. **Filled state** — mirip `DeviceEditor`, tampilkan mini-map non-editable + barcode value + tombol Edit (yang akan membuka ulang banner konfirmasi di atas, bukan form kosong).

**Validasi wajib sebelum Close** (menyusul field existing di `ModalFooter.tsx`):
```
pills: [Alamat, Device, Lokasi (BARU), RCA, Detail, Foto]
```
Field wajib: `latitude`, `longitude`, `barcode_dc`. Behind **feature flag** `GEOTAG_REQUIRED_ENABLED` (pola sama seperti `VALIDASI_FLAG_ENABLED` di `ecosystem.config.js`) — supaya rollout bisa bertahap: awal *soft launch* (opsional, tidak menge-block close), lalu di-enable jadi wajib setelah adopsi teknisi cukup tinggi.

### 6.2 Admin/Helpdesk — War Map

**Route baru: `/admin/tools/war-map`**, ditempatkan di dalam menu sidebar baru **"Tools"** — dikonfirmasi oleh Anda sebagai wadah untuk fitur ini (dan kemungkinan tools lain ke depannya, lihat catatan IA di bawah). Satu shared route dengan RBAC di dalam (bukan duplikasi `admin/`, `helpdesk/`, `superadmin/` seperti pola `rekap-workorder` yang sudah triple-duplicated saat ini) — role `helpdesk` diberi akses ke path `/admin/tools/...` yang sama lewat `protectApi`/middleware, **bukan** bikin folder route terpisah `/helpdesk/tools/war-map`. Ini kesempatan untuk tidak mengulang pola duplikasi tersebut.

**Integrasi ke Sidebar (`app/components/layout/Sidebar.tsx`):**
Saya sudah cek struktur `Sidebar.tsx` yang ada — `MENU_ITEMS` adalah array flat, dan hanya ada satu grup expandable: "Ticket Management" dengan submenu bucket-nya sendiri (state `ticketMenuExpanded` + komponen `SectionToggle`/`SubmenuButton` yang sudah ada, dipakai khusus untuk grup itu; hard-coded hanya untuk item dengan `path === '/admin'`). Untuk menu **"Tools"** yang punya children (War Map, dan berpotensi tools lain dari §12 ke depannya — mis. "ODP Health" §12.1), **keputusan v1.3: generalisasi** ke komponen reusable `ExpandableMenuGroup` (menerima `label`, `icon`, `children: MenuItem[]`, state expand per grup lewat key) — dipakai untuk "Ticket Management" dan "Tools" sekaligus. Ini searah dengan prinsip *surgical additive* dan menghindari pola paralel yang mirip tapi terpisah (pola copy-paste `ticketMenuExpanded` **ditolak**).

**Akses Helpdesk & Layout (keputusan v1.3):**
- **Middleware**: guard role guard saat ini (`middleware.ts`) hanya mengizinkan `/admin/*` untuk `admin`/`superadmin`/`senior_leader`/`admin_branch`. **Keputusan: buka prefix `/admin/tools/*` saja** untuk role `helpdesk` — perubahan minimal & scoped (bukan seluruh `/admin/*`). Implementasi: tambah pengecekan di blok role guard bahwa jika `pathname.startsWith('/admin/tools')` diizinkan untuk `helpdesk`, selain jalur /admin normal.
- **Layout**: helpdesk saat ini tidak punya `layout.tsx` sendiri (`app/helpdesk/` hanya page self-contained). **Keputusan: helpdesk render `AdminLayout`/`Sidebar` yang sama** dengan **filter menu per role** — `MENU_ITEMS` difilter berdasar role sehingga helpdesk hanya melihat menu yang relevan (mis. "Tools" → War Map) dan bukan seluruh menu admin. Ini menghindari duplikasi route dan menjaga satu sumber navigasi, sekaligus UX tetap waras (tidak "bersih" tanpa sidebar seperti rekap-workorder helpdesk lama). Route War Map tetap **satu**: `/admin/tools/war-map`.

Struktur menu yang diusulkan:
```
🔧 Tools                          ← parent, expandable (icon: Wrench — sudah dipakai di lucide-react import existing)
   └─ 🗺️ War Map                  ← child, path: /admin/tools/war-map
   └─ (slot kosong untuk tools berikutnya, mis. ODP Health §12.1)
```

Fitur War Map:
- Peta full-screen (Leaflet + OpenStreetMap tiles), marker cluster (lihat §8).
- Filter panel: Workzone, Area/SA, Status (Open/On Progress/Closed), Jenis Tiket (reguler/HVC/MANJA/dst — reuse enum existing), Rentang Tanggal.
- Klik marker → popup: nama customer (masked sebagian untuk privasi, lihat §10), alamat, device_name/ODP, barcode DC, jumlah histori gangguan di titik itu, link ke detail ticket.
- Toggle "Tampilkan histori" vs "Hanya gangguan aktif".
- Badge jumlah titik "hot" (≥3 histori gangguan di titik/`service_no` yang sama dalam 90 hari) — sinyal kuat indikasi masalah infrastruktur, bukan pelanggan.

---

## 7. Data Model

Prinsip desain (mengikuti pola proyek): **dua tabel**, satu snapshot terbaru ("bank data" reusable per `service_no`), satu histori append-only (audit trail per event tagging). Ini identik filosofinya dengan pola `ticket_status_history` (append) vs `ticket` (state terkini) yang sudah dipakai di skema existing.

```prisma
// === BANK DATA — snapshot lokasi terkini per service_no ===
model service_location {
  id                Int       @id @default(autoincrement())
  service_no        String    @unique @db.VarChar(100)
  customer_name     String?   @db.VarChar(255)
  alamat            String?   @db.Text
  latitude          Decimal   @db.Decimal(10, 7)
  longitude         Decimal   @db.Decimal(10, 7)
  accuracy_meters    Decimal?  @db.Decimal(6, 2)
  device_name       String?   @db.VarChar(100)   // ODP
  barcode_dc        String?   @db.VarChar(150)
  workzone          String?   @db.VarChar(100)   // denormalized dari ticket, untuk filter cepat war map
  last_ticket_id    Int?
  last_teknisi_id   Int?
  tagged_count      Int       @default(1)         // berapa kali sudah pernah ditag ulang
  created_at        DateTime  @default(now()) @db.Timestamp(0)
  updated_at        DateTime  @default(now()) @updatedAt @db.Timestamp(0)

  history           service_location_history[]
  last_ticket       ticket?   @relation(fields: [last_ticket_id], references: [id_ticket], onDelete: SetNull)
  last_teknisi      users?    @relation(fields: [last_teknisi_id], references: [id_user], onDelete: SetNull)

  @@index([workzone])
  @@index([latitude, longitude], map: "idx_service_location_geo")   // bounding-box query (lihat §8.2)
  @@index([updated_at])
}

// === HISTORY — append-only, satu baris per event close ticket dengan tagging ===
model service_location_history {
  id                Int       @id @default(autoincrement())
  service_location_id Int
  ticket_id         Int
  incident          String    @db.VarChar(100)
  service_no        String    @db.VarChar(100)
  customer_name     String?   @db.VarChar(255)
  alamat            String?   @db.Text
  latitude          Decimal   @db.Decimal(10, 7)
  longitude         Decimal   @db.Decimal(10, 7)
  accuracy_meters    Decimal?  @db.Decimal(6, 2)
  device_name       String?   @db.VarChar(100)
  barcode_dc        String?   @db.VarChar(150)
  workzone          String?   @db.VarChar(100)
  teknisi_user_id   Int
  source            String    @default("manual_tag") @db.VarChar(20) // manual_tag | reused_bank_data
  tagged_at         DateTime  @default(now()) @db.Timestamp(0)

  service_location  service_location @relation(fields: [service_location_id], references: [id], onDelete: Cascade)
  ticket            ticket           @relation(fields: [ticket_id], references: [id_ticket], onDelete: Cascade)
  teknisi           users            @relation(fields: [teknisi_user_id], references: [id_user])

  @@index([service_location_id])
  @@index([ticket_id])
  @@index([service_no, tagged_at], map: "idx_slh_service_no_tagged_at")
  @@index([workzone, tagged_at], map: "idx_slh_workzone_tagged_at")   // query utama War Map
  @@index([latitude, longitude], map: "idx_slh_geo")
}
```

**Catatan desain penting:**
- `latitude`/`longitude` pakai `Decimal(10,7)` — presisi ~1cm, cukup untuk GPS ponsel (akurasi realistis 3-15m), dan lebih aman dari floating point error dibanding `Float`.
- Tidak memakai tipe `POINT` + `SPATIAL INDEX` MySQL di MVP — cukup `Decimal` + composite index untuk bounding-box query (`WHERE latitude BETWEEN x AND y AND longitude BETWEEN a AND b`), yang jauh lebih sederhana untuk dikelola di Prisma dan cukup performan sampai skala puluhan ribu baris (lihat §8.2). Migrasi ke `SPATIAL INDEX` asli bisa jadi *growth path* fase berikutnya kalau volume data sudah sangat besar (lihat §8.3).
- `service_location` di-**upsert** (bukan insert) — satu baris per `service_no`, jadi query war map/lookup "bank data" selalu O(1) index lookup, tidak perlu agregasi dari histori. Saat upsert, **hanya field yang benar-benar berbeda dari nilai lama yang berubah** — kalau teknisi konfirmasi "Data Masih Benar", praktiknya ini tetap berupa upsert yang idempotent (nilai baru = nilai lama, `updated_at` & `tagged_count` tetap bertambah sebagai bukti "dikonfirmasi ulang", tapi isi data tidak berubah).
- `service_location_history` **selalu insert baris baru berupa snapshot lengkap** setiap kali close ticket terjadi — baik itu jalur "Data Masih Benar" (`source = 'reused_bank_data'`) maupun "Ada yang Berubah" (`source = 'manual_tag'`). Ini **sengaja bukan diff parsial** — alasannya, tabel histori berfungsi sebagai audit trail per titik waktu: query "tampilkan histori titik ini" (`GET /api/war-map/points/[id]/history`, §9.4) harus bisa langsung `SELECT * ... WHERE ticket_id = ?` tanpa perlu menggabung-gabung banyak baris parsial untuk merekonstruksi kondisi lengkap saat itu. Field `source` cukup untuk membedakan mana histori yang "konfirmasi ulang tanpa perubahan" vs "benar-benar ditag ulang manual" tanpa mengorbankan kemudahan query.
- Field `customer_name`/`alamat` didénormalisasi ke kedua tabel (bukan hanya join ke `ticket`) — konsisten dengan pola existing di skema ini (`ticket_raw` vs `ticket` juga saling denormalisasi field yang sama). Alasan: `ticket.alamat` bisa berubah di masa depan, tapi histori lokasi harus tetap merekam apa yang benar **saat tagging terjadi** (append-only, immutable).
- **Tidak backward-incompatible** — kedua tabel baru sepenuhnya additive, tidak mengubah kolom/index tabel `ticket` yang sudah ada.

---

## 8. Arsitektur, Infrastruktur & Skalabilitas

### 8.1 Alur Penulisan Data (Write Path)

Tidak butuh worker/queue baru. Ditulis **sinkron di dalam transaksi Prisma yang sudah ada** di `TicketWorkflowService.closeTicket()`:

```
POST /api/tickets/close
  → validasi closeTicketSchema (+ field lat/long/accuracy/barcode_dc/locationSource BARU)
  → TicketWorkflowService.closeTicket()
      → tx: lockTicketRow + validasi (alamat, evidence ≥2, RCA/detail, BARU: device_name server-side)
      → tx: update ticket (existing)
      → tx: upsert service_location (by service_no)   ← BARU
      → tx: insert service_location_history            ← BARU
      → tx: existing (assignment history, status log, activity log, tech_event)
  → broadcastTicketInvalidate('close')   (existing, SSE)
  → BARU: broadcastWarMapUpsert(service_no, lat, long)  → channel SSE baru khusus war map
```

Titik injeksi di `TicketWorkflowService.closeTicket()` (file `ticketWorkflow.service.ts`, di dalam `prisma.$transaction`): sisipkan langkah `upsert service_location` + `insert service_location_history` **setelah** `tx.ticket.update` dan **sebelum** `createTechEvent` — sehingga atomicity tetap terjaga (jika close gagal, data lokasi tidak ikut tersimpan, dan sebaliknya), konsisten dengan evidence/RCA/status saat ini. Koordinat yang diinput teknisi **tidak divalidasi hard** terhadap batas administratif workzone (lihat §10).

### 8.2 Read Path — War Map Query

Endpoint baru: `GET /api/war-map/points?bbox=<south,west,north,east>&workzone=&status=&from=&to=`

- **Viewport-based bounding box query** — war map **tidak pernah** fetch semua titik sekaligus. Frontend kirim `bbox` peta yang sedang terlihat; API hanya query titik dalam rentang itu (`WHERE latitude BETWEEN south AND north AND longitude BETWEEN west AND east`), memakai index `idx_slh_geo` / `idx_service_location_geo`. Ini pola standar untuk peta skala apapun dan mencegah query full-table-scan saat data tumbuh ribuan baris.
- **Client-side marker clustering** pakai library `supercluster` (ringan, tidak butuh server GIS) di dalam komponen Leaflet — mengelompokkan marker berdekatan jadi satu bubble angka saat zoom-out, pecah otomatis saat zoom-in. Ini standar industri untuk war-map jenis ini (dipakai luas di Uber, Airbnb map).
- **Caching**: hasil query per kombinasi `bbox + filter` di-cache ke Redis dengan TTL pendek (mis. 15-30 detik, mirip pola `DASHBOARD_CACHE_TTL`/`TICKETS_CACHE_TTL` yang sudah ada di `ecosystem.config.js`), lalu di-invalidate lewat SSE saat ada tagging baru — bukan polling terus-menerus.
- **Realtime**: reuse `sseBroadcast.ts`/`initSSERedis` yang sudah ada di `server.ts` — tambah channel/event type baru (`war-map:new-point`) supaya war map admin/helpdesk yang sedang terbuka otomatis dapat marker baru tanpa refresh manual, tanpa menambah infrastruktur SSE baru.

### 8.3 Skalabilitas Jangka Panjang

| Skala | Strategi |
|---|---|
| Ratusan – ribuan titik (realistis Area 3 dalam 1-2 tahun) | Bounding-box query + index composite `Decimal` sudah lebih dari cukup. Tidak perlu perubahan. |
| Puluhan ribu+ titik / query spasial kompleks (radius search, polygon area) | Migrasi opsional ke kolom `POINT` MySQL 8 + `SPATIAL INDEX` (`ST_Contains`, `ST_Distance_Sphere`), atau pertimbangkan PostGIS/read-replica khusus analitik jika beban query war map mulai mengganggu OLTP utama. Ini keputusan *nanti*, bukan sekarang — MVP tidak perlu over-engineering di awal. |
| Beban baca tinggi bersamaan (banyak admin buka war map sekaligus) | Karena war map hanya scoped ke `PRISMA_CONNECTION_LIMIT` yang sudah dikonfigurasi ketat per proses (web=15, projection=6, dst di `ecosystem.config.js`), pastikan endpoint war map pakai connection pool proses `dompis-server` (Next.js API route), bukan proses worker — sudah otomatis karena API route jalan di proses web. |

### 8.4 Tidak Mengganggu Arsitektur QOSMIC Bridge

Karena `service_location`/`service_location_history` sepenuhnya independen dari `ticket_raw` (sumber ingestion QOSMIC), fitur ini **tidak bersinggungan** dengan migrasi besar QOSMIC Bridge BullMQ yang sedang berjalan. Tidak ada perubahan di `worker-ingestion.ts`, `worker-projection.ts`, `worker-bridge.ts`, atau rate-limiter QOSMIC. Aman dikerjakan paralel tanpa saling blocking.

---

## 9. API Contract (ringkas)

### 9.1 Extend `closeTicketSchema` (di `app/libs/validations/ticket.schema.ts`)
Tambah field opsional-jadi-wajib (tergantung feature flag `GEOTAG_REQUIRED_ENABLED`, dibaca di route — pola `VALIDASI_FLAG_ENABLED`):
```
latitude: number (-90..90)
longitude: number (-180..180)
accuracyMeters?: number (opsional, akurasi GPS)
barcodeDc: string (maks 150 karakter)
locationSource: 'manual_tag' | 'reused_bank_data'
```
Penambahan field ini diteruskan dari `app/api/tickets/close/route.ts` ke `closeTicket()` (signature diperluas), bukan hanya `passthrough` — because validasi kewajiban (bila flag ON) juga dilakukan server-side di service, bukan sekadar lintasan schema.

### 9.2 `GET /api/tickets/[id]/location-bank?serviceNo=`
- Role: `teknisi` (scoped ke ticket miliknya)
- Return bank data existing untuk `service_no` (jika ada) → dipakai untuk render banner "Gunakan Lokasi Sebelumnya" di §6.1.

### 9.3 `GET /api/war-map/points`
- Role: `admin`, `superadmin`, `helpdesk`, `senior_leader`, `admin_branch` (via `protectApi`)
- Query params: `bbox`, `workzone[]`, `area[]`, `status`, `from`, `to`, `hotOnly` (boolean)
- Response: array titik + cluster metadata + `historyCount` per titik.

### 9.4 `GET /api/war-map/points/[serviceLocationId]/history`
- Detail histori satu titik (untuk popup "lihat semua histori gangguan di titik ini").

---

## 10. Keamanan & Privasi

- Nama & alamat pelanggan adalah **data pribadi** — war map hanya boleh diakses role yang sudah diberi otorisasi via `protectApi(['admin','superadmin','helpdesk','senior_leader','admin_branch'])`, tidak pernah expose ke teknisi lain di luar ticket miliknya.
- Pertimbangkan **masking sebagian** nama pelanggan di popup war map (mis. "Budi S***") untuk role `helpdesk` jika kebijakan privasi internal mengharuskan — ini keputusan bisnis, saya tandai sebagai open question di §12.
- Endpoint war map wajib melalui `enforceApiRateLimit` (pola sama seperti `tickets-close`) untuk mencegah scraping data pelanggan massal.
- GPS koordinat yang diinput teknisi **tidak divalidasi hard** terhadap batas administratif workzone (karena GPS indoor bisa meleset) — hanya soft-warning akurasi rendah. Validasi lokasi tetap keputusan manual teknisi (draggable marker), bukan otomatis reject.
- Semua write location tercatat `teknisi_user_id` + `tagged_at` — auditable, konsisten dengan `ticket_activity_log` yang sudah selalu mencatat siapa-melakukan-apa-kapan.

---

## 11. Rollout Plan (Fase, mengikuti pola kerja proyek: additive, feature-flagged, backward-compatible)

| Fase | Scope | Feature flag |
|---|---|---|
| **Fase 0** | Audit ulang final (schema lock, cek tidak ada konflik nama tabel/kolom) — *sudah dilakukan di dokumen ini* | – |
| **Fase 1** | Migrasi Prisma additive: `service_location`, `service_location_history` | – |
| **Fase 2** | Backend: extend `closeTicketSchema`, extend `TicketWorkflowService.closeTicket()` (upsert + insert dalam tx yang sama), endpoint `location-bank` | `GEOTAG_REQUIRED_ENABLED=false` (soft launch — field muncul tapi tidak wajib) |
| **Fase 3** | Frontend Teknisi: `LocationTagger.tsx` (mini-map draggable + geolocation), integrasi barcode scanner, pill "Lokasi" di `ModalFooter` + **harden server-side validasi `device_name`** di `closeTicket()` | flag sama |
| **Fase 4** | Setelah adopsi teknisi terpantau baik (mis. >80% ticket closed sudah ada tagging selama 1-2 minggu) → set `GEOTAG_REQUIRED_ENABLED=true` | wajib mulai fase ini |
| **Fase 5** | War Map admin/helpdesk: route `/admin/tools/war-map`, menu sidebar "Tools" baru (`ExpandableMenuGroup`), guard helpdesk prefix `/admin/tools/*` di middleware, endpoint `war-map/points`, clustering, filter panel | `WAR_MAP_ENABLED` |
| **Fase 6** | Realtime SSE channel + cache layer + tuning performa berdasar volume data riil | – |
| **Fase 7 (opsional, masa depan)** | Insight lanjutan: heatmap "titik gangguan berulang", auto-flag `service_no` dengan ≥3 gangguan/90 hari sebagai kandidat perbaikan infrastruktur (ODP/ODC) — bisa jadi dashboard analitik terpisah mirip `/admin/semesta` | – |

Setiap fase build-verifiable secara independen (`npm run typecheck`, `npm run build`) sebelum lanjut ke fase berikutnya — sesuai kebiasaan kerja proyek ini.

---

## 12. Ide Pengembangan Lanjutan (Menuju "Super Canggih")

Ini di luar scope MVP (§4), tapi saya rancang skema dan arsitektur di atas supaya **semua ide berikut bisa dibangun di atasnya tanpa migrasi ulang** — jadi kalau mau, bisa masuk roadmap Fase 7+ secara bertahap. Saya kelompokkan dari yang paling murah/cepat sampai yang paling ambisius.

### 12.1 Infrastructure Health Score per ODP/ODC (quick win, dampak besar)
Data yang sudah Anda kumpulkan (`device_name`/ODP + koordinat + histori gangguan) sebenarnya sudah cukup untuk **agregasi per ODP**, bukan cuma per `service_no`. Query `GROUP BY device_name` pada `service_location_history` dalam rentang 30/90 hari akan langsung menunjukkan ODP mana yang gangguannya jauh di atas rata-rata dibanding pelanggan lain di ODP yang sama — sinyal kuat "ini masalah infrastruktur (kabel/splitter rusak), bukan masalah per-pelanggan". Ini bisa jadi tab baru di `/admin/semesta` (yang memang sudah jadi rumah analitik multi-dimensi Anda) bernama "ODP Health" — ranking ODP berdasar skor gangguan berulang, tanpa perlu tabel baru sama sekali, cukup query agregat dari data yang sudah ada.

### 12.2 Auto-Suggest Barcode DC & ODP dari Riwayat Terdekat (Nearest Neighbor)
Saat teknisi berada di lokasi yang **belum pernah** ditag untuk `service_no` itu, tapi koordinatnya dekat (radius mis. 50-100m) dengan `service_location` lain yang sudah ada — sistem bisa menyarankan: *"Ada 3 pelanggan lain di radius 80m menggunakan ODP-RKT-FCK/01, apakah ini ODP yang sama?"*. Ini murni bounding-box query (§8.2) yang sudah ada di war map, tinggal dipakai ulang di sisi teknisi untuk mempercepat input dan mengurangi typo ODP — potensi dampak besar untuk akurasi data ODP jangka panjang.

### 12.3 EXIF/Anti-Spoofing Ringan untuk Foto Evidence
Sistem sudah wajib 2 foto evidence sebelum close (`ticket_evidence`). Karena war map bergantung pada kejujuran GPS, langkah murah untuk menaikkan kepercayaan data: baca metadata EXIF GPS dari foto evidence yang di-upload (kalau kamera device menyimpannya), bandingkan jaraknya dengan koordinat yang diinput manual di `LocationTagger`. Kalau selisih > threshold tertentu (mis. 300m), tampilkan warning non-blocking ke teknisi maupun flag "perlu review" ke admin. Ini tidak butuh tabel baru — cukup proses tambahan saat upload evidence.

### 12.4 Predictive Hotspot / Early-Warning Cluster Detection
Begitu volume histori cukup (beberapa bulan berjalan), bisa dijalankan job terjadwal ringan (bukan realtime — cukup masuk sebagai cron di `worker.ts` ops-worker yang sudah ada, tidak perlu worker baru) yang menghitung density cluster gangguan per minggu dan membandingkan tren naik/turun per titik. Kalau satu cluster ODP menunjukkan tren gangguan naik 2 minggu berturut-turut, sistem bisa auto-notify admin **sebelum** eskalasi jadi banyak komplain — pendekatan proaktif, bukan reaktif seperti saat ini. Ini natural extension dari App yang sudah punya `tech_event_outbox` dan notification topbar (`topbar_notification_state`) — tinggal tambah event type baru.

### 12.5 War Map sebagai Alat Bantu Assignment Cerdas
`cluster_node`/`cluster_area` sudah menyimpan struktur assignment teknisi per ODC. Setelah war map hidup dan data lokasi cukup padat, war map bisa dipakai untuk **visualisasi assignment** — overlay wilayah tanggung jawab tiap teknisi/tim di atas peta yang sama, sehingga admin bisa lihat langsung "ticket baru masuk di titik X, siapa teknisi terdekat yang sedang available" — jembatan alami menuju auto-assign berbasis jarak (disebutkan sebagai potential future di §4, sekarang jadi jauh lebih murah dibangun karena data koordinat sudah ada).

### 12.6 Timeline Visual per Titik (bukan cuma war map, tapi "riwayat hidup" tiap pelanggan/ODP)
Karena `service_location_history` menyimpan snapshot lengkap tiap event (§7), popup war map bisa menampilkan **timeline** gangguan di titik itu — kapan saja, RCA apa, siapa teknisinya, berapa lama TTR — mirip `TicketHistoryTimeline.tsx` yang sudah ada di detail modal teknisi, tapi versi agregat per lokasi/ODP. Ini sangat berguna saat admin/helpdesk perlu jawab pertanyaan "kenapa titik ini sering gangguan" tanpa harus buka satu-satu ticket lama secara manual.

### 12.7 Export & Integrasi Eksternal
Karena semua export existing di app ini (rekap workorder, dashboard durasi, technician performance) sudah pakai pola export Excel yang konsisten (`xlsx`, `papaparse`), war map data juga bisa diberi opsi export ke **KML/GeoJSON** — supaya bisa dibuka di Google Earth atau software GIS internal Telkom Akses kalau suatu saat dibutuhkan untuk pelaporan ke level yang lebih tinggi (witel/regional), tanpa perlu membangun GIS penuh di dalam Dompis sendiri.

### 12.8 Offline-Tolerant Tagging (penting untuk realita lapangan Suramadu)
Sinyal seluler di sebagian titik Area 3 kemungkinan tidak stabil. `LocationTagger` sebaiknya dirancang agar **koordinat + barcode bisa disimpan sementara di local state / localStorage-equivalent di browser** kalau submit close gagal karena jaringan putus, lalu auto-retry submit begitu koneksi kembali — supaya teknisi tidak perlu mengulang tagging manual dari nol akibat sinyal lemah. Ini murni penguatan UX di sisi frontend, tidak menyentuh backend.

**Prioritas realistis kalau ingin mulai:** §12.1 (ODP Health Score) dan §12.2 (auto-suggest nearest) adalah yang paling murah untuk dibangun dan langsung terasa dampaknya ke operasional harian — keduanya cukup query tambahan di atas skema §7 yang sudah dirancang, tanpa perubahan arsitektur.

---

## 13. Open Questions (perlu keputusan Anda sebelum eksekusi)

Status v1.3 — yang sudah diputus dihapus/ditandai, sisanya menunggu:

1. ~~**Wajib vs opsional saat launch**~~ → **DIPUTUSKAN (v1.3):** soft-launch dulu dengan `GEOTAG_REQUIRED_ENABLED=false`, wajib di-enable di Fase 4 setelah adopsi terpantau (>80% selama 1-2 minggu). (Pola rollout bertahap, pengalaman lapangan sinyal GPS di dalam rumah sensitif.)
2. ~~**Akses helpdesk ke war map**~~ → **DIPUTUSKAN (v1.3):** prefix `/admin/tools/*` saja, helpdesk render `AdminLayout` + sidebar filter-per-role (lihat §6.2).

Open questions yang masih menunggu:
1. **Barcode DC — format & sumber kebenaran**: apakah barcode DC punya format standar (mis. selalu numerik N digit, atau prefix tertentu) yang perlu divalidasi di frontend? Ini akan menentukan apakah perlu regex validation khusus.
2. **Privasi nama pelanggan di war map untuk role helpdesk** — perlu masking atau tampil penuh? (§10)
3. **Basemap tile provider** — OpenStreetMap gratis (recomendasi MVP) atau ada preferensi Google Maps/Mapbox berbayar untuk kualitas citra satelit area Suramadu yang lebih baik?
4. **Definisi "titik panas" (hot point)** — threshold berapa kali gangguan berulang di `service_no`/titik yang sama dalam rentang berapa hari yang dianggap signifikan? (§6.2 memakai contoh ≥3/90 hari, perlu validasi dengan data riil operasional).

---

## 14. Ringkasan Perubahan Kode (untuk referensi eksekusi lanjutan)

Jika PRD ini disetujui, langkah eksekusi berikut bisa langsung diberikan sebagai prompt terpisah ke OpenCode/Codex CLI (sesuai alur kerja Anda), per fase di §11:

- `prisma/schema.prisma` — tambah 2 model baru (§7)
- `app/libs/validations/ticket.schema.ts` — extend `closeTicketSchema`
- `app/libs/services/ticketWorkflow.service.ts` — extend `closeTicket()` (§8.1) + harden `device_name`
- `app/api/tickets/close/route.ts` — passthrough field baru
- `app/api/tickets/[id]/location-bank/route.ts` — **baru**
- `app/api/war-map/points/route.ts` — **baru**
- `app/api/war-map/points/[id]/history/route.ts` — **baru**
- `app/teknisi/components/detail-modal/LocationTagger.tsx` — **baru** (pola `DeviceEditor.tsx`)
- `app/teknisi/components/detail-modal/ModalFooter.tsx` — tambah pill "Lokasi"
- `app/teknisi/components/detail-modal/DetailTicketSection.tsx` — mount `LocationTagger`
- `app/teknisi/components/TicketDetailModal.tsx` — state `isLocationEmpty` + scroll handler + kirim field geo saat close
- `app/admin/tools/war-map/page.tsx` — **baru**
- `app/admin/tools/war-map/components/*` — **baru** (peta, filter panel, popup)
- `app/components/layout/Sidebar.tsx` — tambah entri menu **"Tools"** + **filter `MENU_ITEMS` per role** (lihat §6.2)
- `app/components/layout/ExpandableMenuGroup.tsx` — **baru**, komponen reusable hasil generalisasi (dipakai Ticket Management + Tools)
- `middleware.ts` — buka prefix `/admin/tools/*` untuk role `helpdesk`
- `app/libs/sseBroadcast.ts` — tambah channel `war-map:new-point` + `broadcastWarMapUpsert`
- `package.json` — tambah dependency: `leaflet`, `react-leaflet`, `supercluster`, `@types/leaflet`

**Untuk ide quick-win §12.1 dan §12.2** (kalau ingin langsung disertakan di roadmap dekat, bukan Fase 7 terpisah):
- §12.1 (ODP Health Score) — tambah tab baru di `app/admin/semesta/components/` + endpoint agregat baru `app/api/dashboard/odp-health/route.ts`, murni query `GROUP BY device_name` di atas `service_location_history`, tidak perlu tabel baru.
- §12.2 (Auto-suggest nearest ODP) — endpoint kecil `app/api/tickets/[id]/nearby-locations/route.ts` (bounding-box radius kecil di sekitar posisi GPS teknisi saat ini), dipanggil dari `LocationTagger.tsx` saat `service_no` belum ada bank data sama sekali.

Saya siap susun prompt eksekusi Phase 1 (migrasi schema) begitu Anda konfirmasi keputusan di §13.
