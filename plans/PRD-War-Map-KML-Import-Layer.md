# PRD — Import KML sebagai Layer Overlay War Map
**Produk:** Dompis v2 — Telkom Akses Area 3 (Suramadu)
**Fitur ini melanjutkan:** `PRD-War-Map-Geo-Tagging-Gangguan.md` (v1.2, sudah live di production — dikonfirmasi lewat audit kode terbaru: `service_location`/`service_location_history` sudah ada di schema, route `/admin/tools/war-map` sudah jalan, `WAR_MAP_ENABLED=true` di `ecosystem.config.js`)
**Versi Dokumen:** 1.0 (Draft untuk review)
**Status:** Belum ada implementasi — net-new

---

## 1. Latar Belakang & Audit

### 1.1 Kondisi War Map Saat Ini (hasil audit codebase terbaru)

Saya sudah cek ulang implementasi nyata (bukan lagi rencana) dari upload terbaru Anda:

- `WarMapClient.tsx` (980 baris) — sudah pakai `react-leaflet` + `supercluster` untuk clustering marker gangguan, dengan `FilterPanel` (workzone, area, status, jenis tiket, bucket, rentang tanggal, hot-only, active-only), layout `grid lg:grid-cols-[300px_1fr]` (filter di kiri desktop, stack di atas map saat mobile via `order-1`/`order-2`).
- `GET /api/war-map/points` — sudah pakai strategi bounding-box (`bbox=south,west,north,east`) + cache 15 detik + rate limit 120/menit, persis sesuai desain PRD sebelumnya.
- Middleware sudah diperluas: role `helpdesk` diberi akses terbatas ke `/admin/tools` dan `/admin/tools/war-map` saja (bukan seluruh `/admin/tools/*`), sementara tools admin-only lain (mis. Import Tiket) tetap terkunci dari `helpdesk`. Pola whitelist granular ini **jadi acuan langsung** untuk middleware KML import di bawah (§10).
- Ada **precedent arsitektur yang sangat pas** untuk fitur import baru ini: `/admin/tools/import-tiket` — sudah punya alur **Preview → Run → Status** yang matang (`api/import-tiket/preview`, `/run`, `/status`, `/last-upload`), termasuk validasi ukuran file, deteksi kolom otomatis, dan panel hasil (`ImportPreviewPanel.tsx`, `ImportResultPanel.tsx`). **Fitur import KML akan meniru alur ini persis**, bukan membuat pola baru.

### 1.2 Analisis Mendalam File Contoh (`ODC-RKT-FKT.kml`)

Saya parse langsung file yang Anda kirim. Temuan struktural penting yang **menentukan desain data model & parser**:

| Elemen | Jumlah/Detail |
|---|---|
| Total `<Placemark>` | 335 |
| Geometri `<Point>` (ODC + ODP) | 260 |
| Geometri `<LineString>` (kabel distribusi) | 75 |
| `<Polygon>` | 0 (tidak ada area/wilayah, aman — tidak perlu handle geometri poligon di MVP) |
| `<ExtendedData>` terstruktur (KML standar) | 0 — **semua metadata ada di tag `<description>` sebagai teks bebas**, bukan `<ExtendedData><Data>` XML terstruktur |
| Style/ikon unik (`styleUrl`) | 81 style berbeda |

**Struktur folder (hierarki asli file, ini penting untuk desain layer toggle §7):**
```
Document "ODC-RKT-FKT.kml"
├─ Folder "ODC-RKT-FKT"                    ← nama ODC = nama folder root
│   ├─ Placemark "ODC-RKT-FKT" (Point)     ← 1 titik ODC
│   └─ Folder "ODP"
│       ├─ Folder "D.01"  → 14 Placemark ODP (Point)
│       ├─ Folder "D.02"  → 10 Placemark ODP (Point)
│       ├─ Folder "D.03"  → ...dst per zona distribusi
├─ Folder "DISTRIBUSI"
│   ├─ Folder "D.01"  → banyak Placemark kabel (LineString)
│   ├─ Folder "D.02"  → ...
```

**Isi `<description>` — dua pola berbeda yang harus ditangani berbeda:**

1. **Placemark kabel (LineString)** — formatnya **konsisten dan terstruktur** (`Key : Value` per baris):
   ```
   Spec Id : AC-OF-SM-24-SC
   Network Type : Distribution
   Fiber Length : 128.294 m
   Construction Status : In Service
   Witel : SURABAYA SELATAN
   Sto : RKT
   Jumlah HP : 106
   Project Id : 4568003-4568008
   ```
   → **Aman untuk di-parse otomatis** jadi field terstruktur (regex `key : value` per baris cukup andal untuk pola ini).

2. **Placemark ODC/ODP (Point)** — formatnya **bebas, tidak konsisten** antar baris (mis. `ODP-RKT-FKT/01\nFKT/D01/01.01\nODP-PB-8\nOS-SM 1=1\nPS 1x 1:8 (1)` untuk ODP, vs `ODC-C 288\nFE-RKT-53-01-03\n -7.316191°\n112.757908°` untuk ODC — pola baris berbeda antara keduanya, tidak ada key-value eksplisit). → **Tidak aman diparse otomatis jadi field terpisah** — risiko salah-parse tinggi kalau file dari sumber/operator KML lain formatnya sedikit berbeda. Rekomendasi: **simpan `description` mentah apa adanya** (ditampilkan penuh di popup saat diklik), jangan coba pecah jadi kolom individual untuk titik ODC/ODP.

**Kesimpulan desain:** Parser harus **dual-mode** — regex key-value untuk kabel/LineString (nilainya konsisten dan actionable, mis. untuk filter "tampilkan hanya kabel status Belum Terpasang"), dan simpan-mentah untuk titik ODC/ODP (description ditampilkan sebagai teks, tanpa asumsi format).

---

## 2. Problem Statement

War Map saat ini hanya menampilkan **titik gangguan** (dari `service_location`/`service_location_history`) — tanpa konteks infrastruktur jaringan fisik (di mana persis ODC, ODP, dan jalur kabel distribusi berada). Admin/helpdesk yang melihat cluster gangguan di satu area **tidak bisa langsung menghubungkan** "gangguan ini dekat dengan ODP mana / kabel mana" tanpa buka aplikasi/peta terpisah (Google Earth, dsb). Data topologi jaringan ini **sudah ada** dalam bentuk file KML yang dikelola tim planning/NOC, tapi terisolasi dari Dompis.

## 3. Tujuan (Goals)

1. Admin (superadmin/admin) bisa **upload file KML** (hasil export Google Earth/tools GIS internal Telkom Akses) berisi topologi ODC/ODP/kabel distribusi.
2. Data KML diparse dan disimpan sebagai **layer overlay** yang bisa ditampilkan/disembunyikan di War Map, terpisah dari layer titik gangguan yang sudah ada.
3. Layer bisa di-toggle **berdasarkan judul/pengelompokan dari KML itu sendiri** (nama file, dan sub-grup dari folder di dalamnya — mis. "Titik ODC/ODP" vs "Jalur Kabel Distribusi") — sesuai permintaan eksplisit Anda.
4. Admin bisa mengelola banyak file KML terunggah dari waktu ke waktu (satu file per ODC/STO, mengumpulkan basemap infrastruktur secara bertahap) lewat satu **Layer Manager**.
5. War Map tetap **cepat dan responsif** meski layer KML aktif — tidak boleh menurunkan performa yang sudah dicapai di fitur geotagging (§8 PRD sebelumnya).

## 4. Non-Goals (Out of Scope MVP)

- Tidak membangun editor KML di dalam Dompis (upload-only, bukan digitasi titik/garis baru langsung di peta).
- Tidak mendukung KMZ (KML terkompresi ZIP) di MVP — file yang diuji adalah `.kml` polos. KMZ didaftarkan sebagai item Fase lanjutan (§13), karena Google Earth Pro secara default sering export ke `.kmz`.
- Tidak melakukan **snapping otomatis** antara titik ODP dari KML dengan `device_name` di `service_location` (itu ide sinergi lanjutan, §13.1 — bukan MVP).
- Tidak mendukung `<Polygon>` / area cakupan di MVP (tidak ditemukan di sample file; ditambah nanti kalau memang dibutuhkan).

## 5. Actors & Roles

| Role | Kemampuan |
|---|---|
| **Admin, Superadmin** | Upload, preview, commit import KML; kelola (hapus/nonaktifkan) layer; toggle default visibility. Mengikuti pola akses `import-tiket` yang sudah admin/superadmin-only. |
| **Helpdesk, Senior Leader, Admin Branch** | **Read-only** — bisa melihat & toggle tampilan layer KML yang sudah diimpor di War Map, tidak bisa upload/hapus. |
| **Teknisi** | Tidak ada akses ke fitur ini (di luar scope War Map/Tools). |

---

## 6. Data Model

Dua tabel baru, mengikuti pola yang sama seperti `service_location`/`service_location_history` — dan sepenuhnya additive, tidak menyentuh model existing.

```prisma
model kml_layer {
  id                Int       @id @default(autoincrement())
  title             String    @db.VarChar(150)      // default = nama file KML, editable saat preview
  original_filename String    @db.VarChar(255)
  file_size_bytes   Int
  storage_path      String    @db.VarChar(500)       // path file KML mentah tersimpan (§7.3)
  workzone_tag      String?   @db.VarChar(100)        // opsional, admin bisa tag manual saat import (mis. "RKT") untuk filter cepat
  point_count       Int       @default(0)
  line_count        Int       @default(0)
  bbox_south        Decimal?  @db.Decimal(10, 7)
  bbox_west         Decimal?  @db.Decimal(10, 7)
  bbox_north        Decimal?  @db.Decimal(10, 7)
  bbox_east         Decimal?  @db.Decimal(10, 7)
  status            String    @default("active") @db.VarChar(20)  // active | archived
  uploaded_by       Int
  uploaded_at       DateTime  @default(now()) @db.Timestamp(0)
  updated_at        DateTime  @default(now()) @updatedAt @db.Timestamp(0)

  uploader          users         @relation(fields: [uploaded_by], references: [id_user])
  sublayers         kml_sublayer[]
  features          kml_feature[]

  @@index([status])
  @@index([workzone_tag])
}

// Representasi grup folder dari KML asli (mis. "ODC-RKT-FKT", "ODP", "DISTRIBUSI")
// — inilah basis toggle "sesuai judul KML" yang Anda minta.
model kml_sublayer {
  id             Int       @id @default(autoincrement())
  kml_layer_id   Int
  folder_path    String    @db.VarChar(300)   // mis. "ODP" atau "DISTRIBUSI" (top-level folder dalam file)
  geometry_kind  String    @db.VarChar(10)    // "point" | "line"
  feature_count  Int       @default(0)
  default_visible Boolean  @default(true)     // diatur admin saat preview (§9.1)
  display_order  Int       @default(0)

  layer          kml_layer     @relation(fields: [kml_layer_id], references: [id], onDelete: Cascade)
  features       kml_feature[]

  @@unique([kml_layer_id, folder_path])
}

model kml_feature {
  id               Int       @id @default(autoincrement())
  kml_layer_id     Int
  kml_sublayer_id  Int
  name             String    @db.VarChar(255)          // <name> placemark, mis. "ODP-RKT-FKT/01"
  feature_type     String    @db.VarChar(10)            // "point" | "line"
  folder_path      String    @db.VarChar(300)           // full breadcrumb, mis. "ODP > D.01"
  description_raw  String?   @db.Text                    // description mentah, selalu disimpan apa adanya
  parsed_metadata  Json?                                  // HANYA diisi utk feature_type=line dgn pola key:value (§1.2)
  style_color      String?   @db.VarChar(20)              // hex warna hasil normalisasi (§9.4), bukan style asli KML
  latitude         Decimal?  @db.Decimal(10, 7)           // untuk feature_type = point
  longitude        Decimal?  @db.Decimal(10, 7)           // untuk feature_type = point
  path_coordinates Json?                                   // untuk feature_type = line: [[lng,lat], [lng,lat], ...]
  created_at       DateTime  @default(now()) @db.Timestamp(0)

  layer            kml_layer    @relation(fields: [kml_layer_id], references: [id], onDelete: Cascade)
  sublayer         kml_sublayer @relation(fields: [kml_sublayer_id], references: [id], onDelete: Cascade)

  @@index([kml_layer_id])
  @@index([kml_sublayer_id])
  @@index([latitude, longitude], map: "idx_kml_feature_geo")   // bounding-box query, pola sama seperti service_location
}
```

**Catatan desain kunci:**
- **`kml_sublayer` adalah jawaban langsung untuk "menampilkan data dari KML sesuai judulnya"** — setiap top-level folder dalam KML (ODC-RKT-FKT, ODP, DISTRIBUSI) jadi satu baris sublayer yang independen di-toggle. Ini memberi granularitas yang tepat: cukup detail untuk berguna (bisa matikan kabel tapi tetap lihat ODP), tidak berlebihan (tidak sampai per-`D.01`/`D.02` individual sebagai toggle terpisah, itu bisa jadi filter tambahan di UI kalau memang dibutuhkan nanti, bukan struktur tabel terpisah).
- `path_coordinates` disimpan sebagai `Json` (array koordinat), bukan tabel titik terpisah — karena satu LineString adalah satu unit geometri yang selalu dibaca utuh (tidak pernah diquery per-titik individual dalam garis), jadi JSON blob lebih murah dan sederhana dibanding normalisasi berlebihan.
- `parsed_metadata` (`Json`, nullable) — hanya diisi untuk `feature_type = 'line'` mengikuti pola key-value yang terbukti konsisten (§1.2). Untuk `point`, kolom ini `null` — `description_raw` adalah satu-satunya sumber info, ditampilkan apa adanya di popup, sesuai keputusan desain di §1.2 untuk menghindari parser yang rapuh.
- Sengaja **tidak pakai tipe `LINESTRING`/`POINT` MySQL native** — konsisten dengan keputusan yang sama di `service_location` (Decimal + JSON lebih sederhana dikelola lewat Prisma, cukup performan untuk skala ratusan-ribuan fitur per file, lihat §7.4).

---

## 7. Arsitektur & Pipeline

### 7.1 Alur Import (mengikuti pola `import-tiket` persis)

```
1. Admin buka /admin/tools/import-kml
2. Upload file .kml (drag-drop atau file picker)
      ↓
3. POST /api/war-map/kml-layers/preview
   - Parse XML (§7.2), TIDAK menyimpan apa pun ke DB
   - Validasi: well-formed XML, ada minimal 1 Placemark dengan geometri valid
   - Return: judul default (dari <name> Document), daftar sublayer terdeteksi
     (folder_path, geometry_kind, feature_count), bounding box, preview 5 baris
     contoh Placemark per sublayer, warning (mis. placemark tanpa koordinat valid
     yang akan di-skip)
      ↓
4. Admin review di ImportPreviewPanel (pola sama seperti CSV ticket import):
   - Edit judul layer (default nama file)
   - Toggle default_visible per sublayer (mis. matikan "DISTRIBUSI" kalau
     tidak relevan ditampilkan default)
   - Opsional: isi workzone_tag manual
      ↓
5. POST /api/war-map/kml-layers/run
   - Commit: insert kml_layer → insert kml_sublayer (per folder terdeteksi)
     → bulk insert kml_feature (chunked, ukuran chunk mengikuti pola
     INGESTION_WRITE_CHUNK_SIZE existing, mis. 500 baris per batch insert)
   - Simpan file KML mentah ke storage_path (§7.3)
      ↓
6. GET /api/war-map/kml-layers/status?layerId= (polling ringan, untuk file besar)
      ↓
7. Redirect ke War Map — layer baru otomatis muncul di Layer Manager (§9.2)
```

### 7.2 Parsing KML — Library & Pendekatan

**Ini keputusan yang perlu approval Anda** (proyek punya aturan "no new npm packages tanpa approval eksplisit"). Dua kandidat:

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **`fast-xml-parser`** (parse manual ke struktur sendiri) | Ringan (~40KB), sudah lazim dipakai luas, kita kontrol penuh logic ekstraksi Folder/Placemark/Point/LineString sesuai struktur spesifik file Telkom Akses ini | Perlu tulis logic traversal Folder manual (tidak rumit — struktur XML KML cukup predictable) |
| **`@tmcw/togeojson`** (converter KML→GeoJSON siap pakai, dari Mapbox) | Konversi geometri sudah teruji, hemat waktu development | Butuh `@xmldom/xmldom` sebagai dependency tambahan (DOM parser di Node), dan defaultnya **meratakan hierarki folder** — informasi grouping folder (ODC-RKT-FKT/ODP/DISTRIBUSI) hilang kecuali kita extend manual, jadi keuntungan "siap pakai"-nya berkurang untuk use case kita yang justru butuh struktur folder dipertahankan (§6, `kml_sublayer`) |

**Rekomendasi saya: `fast-xml-parser`.** Alasan: kebutuhan inti fitur ini justru mempertahankan struktur Folder (bukan meratakannya seperti pendekatan GeoJSON standar), jadi parser custom di atas `fast-xml-parser` lebih pas — dan dependency tunggal lebih ringan untuk di-maintain jangka panjang dibanding dua library. Ini murni proposal, saya tunggu keputusan approval Anda sebelum masuk fase eksekusi.

Parser dijalankan **server-side saja** (di route handler API, Node runtime) — tidak pernah di client. Ini penting untuk konsistensi (satu sumber kebenaran hasil parse) dan supaya file besar tidak membebani browser.

### 7.3 Penyimpanan File Mentah

File KML asli (bukan hasil parse) tetap disimpan di disk (`/www/wwwroot/dompis_v2/storage/kml-layers/{layer_id}.kml`, mengikuti pola direktori upload lain di proyek — perlu saya konfirmasi lokasi persis storage evidence/upload existing Anda pakai apa, supaya konsisten satu strategi storage) — untuk keperluan **re-parse** (kalau logic parser diperbaiki di kemudian hari, admin bisa "reimport" tanpa upload ulang) dan **audit/download ulang**. Tidak disimpan sebagai BLOB di MySQL (menghindari database bengkak) — hanya path yang tersimpan di `kml_layer.storage_path`.

### 7.4 Rendering & Skalabilitas — sama persis disiplinnya dengan layer titik gangguan

- **`GET /api/war-map/kml-layers/[id]/geojson?bbox=...&sublayer=`** — endpoint serve fitur dalam format GeoJSON standar (langsung dikonsumsi komponen `<GeoJSON>` dari `react-leaflet`), difilter viewport (`bbox`) dan sublayer aktif, **pola query identik dengan `/api/war-map/points`** yang sudah terbukti scalable.
- Cache Redis per `layerId + sublayer + bbox` (TTL lebih panjang dari titik gangguan, mis. 5 menit — data KML jarang berubah dibanding data gangguan real-time).
- Untuk sample file (335 fitur) tidak perlu clustering sama sekali — tapi kalau nanti admin upload file gabungan witel-wide (potensial ribuan ODP), titik ODP bisa ikut dilewatkan ke `supercluster` yang **sudah terpasang** di `WarMapClient.tsx` (reuse instance yang sama, cukup tambah source data), sementara LineString (kabel) tidak di-cluster (garis memang secara natural jarang terlalu padat untuk butuh clustering, cukup andalkan bbox filter).
- Tidak butuh worker/BullMQ baru — commit di `run` route berjalan sinkron dalam response HTTP (335 fitur = sangat cepat; kalaupun nanti file jauh lebih besar dari sample ini, chunked insert tetap dalam satu request-response siklus dengan timeout yang wajar, mengikuti pola `import-tiket/run` yang sudah menangani ribuan baris ticket dengan cara sama).

---

## 8. API Contract (ringkas)

| Endpoint | Method | Role | Fungsi |
|---|---|---|---|
| `/api/war-map/kml-layers/preview` | POST (multipart) | admin, superadmin | Parse tanpa commit, return summary sublayer + bbox |
| `/api/war-map/kml-layers/run` | POST | admin, superadmin | Commit hasil preview ke DB |
| `/api/war-map/kml-layers` | GET | semua role war map | List semua layer aktif + sublayer + toggle state default |
| `/api/war-map/kml-layers/[id]/geojson` | GET | semua role war map | GeoJSON fitur, filter `bbox` + `sublayer` |
| `/api/war-map/kml-layers/[id]` | PATCH | admin, superadmin | Edit judul, workzone_tag, default_visible per sublayer |
| `/api/war-map/kml-layers/[id]` | DELETE | admin, superadmin | Hapus layer (cascade sublayer+feature+file) |

---

## 9. Desain UI/UX

### 9.1 Wizard Import KML (`/admin/tools/import-kml`)

Mengikuti pola visual `import-tiket` yang sudah ada (drag-drop zone, preview panel, result panel) — 3 langkah, ditampilkan sebagai stepper horizontal di desktop / vertikal ringkas di mobile:

**Langkah 1 — Upload**
- Drag-drop zone besar dengan ikon peta, teks "Tarik file .kml ke sini atau klik untuk pilih file" — style konsisten dengan zone upload CSV existing.
- Validasi instan di sisi klien: ekstensi `.kml`, ukuran maks (usul 20MB).

**Langkah 2 — Preview & Konfigurasi**
- Kartu ringkasan atas: judul layer (`<input>` editable, default nama file), jumlah titik terdeteksi, jumlah garis terdeteksi, luas area cakupan (bounding box ditampilkan sebagai mini-map preview statis).
- **Daftar sublayer terdeteksi**, tiap baris:
  ```
  [✓] ODC-RKT-FKT      · Point · 1 fitur
  [✓] ODP              · Point · 259 fitur
  [ ] DISTRIBUSI        · Line  · 75 fitur      ← admin bisa matikan default tampil
  ```
  Toggle di sini menentukan `default_visible` per `kml_sublayer` — bukan menyembunyikan permanen, cuma default state saat layer pertama kali dimunculkan siapa pun di war map (tetap bisa dinyalakan manual dari Layer Manager, §9.2).
- Warning box (kalau ada) — mis. "3 placemark tanpa koordinat valid akan dilewati."
- Tombol "Batalkan" / "Import Sekarang".

**Langkah 3 — Hasil**
- Ringkasan sukses: "X sublayer, Y fitur berhasil diimpor." + tombol langsung "Lihat di War Map".

### 9.2 Layer Manager di War Map — Desktop

Ditambahkan sebagai **panel kedua yang collapsible**, terpisah dari `FilterPanel` yang sudah ada, supaya tidak mencampur dua konsep berbeda (filter data gangguan vs toggle layer infrastruktur). Diletakkan sebagai **tab di dalam kolom kiri yang sama** (`300px` existing), bukan kolom ketiga baru — supaya lebar peta tidak berkurang lebih jauh:

```
┌────────────────────┐
│ [Filter] [Layer] ←  │  tab switcher, konsisten dgn pola tab lain di app (Ticket Management 4-tab)
├────────────────────┤
│ (tab "Layer" aktif) │
│                     │
│ 🗂️ ODC-RKT-FKT      │
│  ├ [✓] Titik ODC/ODP│  259 fitur
│  └ [ ] Kabel Distr. │  75 fitur
│                     │
│ + Tambah Layer KML  │  → link ke /admin/tools/import-kml (admin only)
└────────────────────┘
```
- Setiap layer KML jadi grup collapsible (accordion), berisi sublayer sebagai checkbox individual — **inilah implementasi konkret dari "toggle sesuai judul KML" yang Anda minta**: judul grup = judul layer (bisa diedit admin saat import), baris di dalamnya = sublayer (folder asli dari file KML).
- Search box kecil di atas daftar layer kalau nanti sudah ada banyak file terimpor (>5), supaya tidak perlu scroll panjang untuk cari satu layer spesifik.
- Role `helpdesk`/`senior_leader` melihat panel yang sama tapi tanpa tombol "+ Tambah Layer KML" (read-only sesuai §5).

### 9.3 Layer Manager — Mobile (Responsif)

Filter panel existing sudah pindah ke atas map via `order-1`/`order-2` di breakpoint mobile — pola yang sama **tidak ideal diulang untuk Layer Manager**, karena kalau dua panel (Filter + Layer) sama-sama full-width di atas peta, mobile user harus scroll panjang sebelum sampai ke peta itu sendiri. Untuk itu saya usulkan pola **bottom sheet** (drawer dari bawah), lebih umum dipakai di aplikasi peta mobile modern (Google Maps, Gojek, dsb) dan lebih hemat ruang layar:

- Peta **full-screen** jadi elemen utama begitu halaman dibuka di mobile (bukan filter di atas seperti sekarang).
- Dua **floating action button** melayang di kanan-bawah peta: ikon filter (funnel) dan ikon layer (stack/layers) — tap salah satu membuka **bottom sheet** setengah layar berisi konten panel yang sama seperti versi desktop (tab Filter / tab Layer bisa tetap sama komponennya, cuma dibungkus kontainer berbeda: `<div>` biasa di desktop, bottom sheet di mobile).
- Bottom sheet bisa di-drag naik/turun (snap point: 40% tinggi layar / 90% tinggi layar), supaya user bisa intip peta tanpa menutup sheet sepenuhnya — pola *"partial expand"* standar di peta mobile.
- **Catatan implementasi:** ini perubahan pola dibanding `FilterPanel` versi sekarang yang stack di atas map. Kalau Anda ingin perubahan ini juga diterapkan ke `FilterPanel` gangguan yang sudah ada (bukan cuma Layer Manager baru), saya bisa scope-kan sebagai *refactor* terpisah — tandai sebagai pertanyaan terbuka di §12.

### 9.4 Rendering Visual — Normalisasi Ikon (bukan pakai ikon asli KML)

File KML sample punya **81 style berbeda** (banyak berasal dari ikon Google Maps generik: `shaded_dot`, `paddle/grn-stars`, dll — style dari proses digitasi manual di Google Earth, bukan didesain untuk konsistensi visual). **Rekomendasi: jangan pertahankan ikon asli KML.** Sebagai gantinya, normalisasi ke bahasa visual Dompis sendiri, konsisten dengan `markerIcon()` yang sudah ada di `WarMapClient.tsx` untuk titik gangguan:

| Jenis fitur | Ikon di War Map Dompis |
|---|---|
| ODC (folder root, biasanya 1 per file) | Segitiga solid, warna ungu/indigo (beda dari warna gangguan yang sudah pakai merah/biru/hijau) |
| ODP | Lingkaran kecil, warna abu-gelap/slate — netral, tidak bersaing visual dengan marker gangguan yang lebih penting dilihat lebih dulu |
| Kabel distribusi (LineString) | Garis putus-putus tipis, warna sesuai `Construction Status` dari `parsed_metadata` kalau tersedia (mis. hijau = "In Service", abu = status lain) — ini **contoh konkret manfaat parsing key-value** di §1.2/§6 |

Alasan normalisasi (bukan preservasi ikon asli): (1) menghindari harus meng-hosting/proxy ratusan URL ikon `maps.google.com/mapfiles/...` yang bisa berubah/hilang sewaktu-waktu di luar kendali kita, (2) menjaga War Map tetap punya bahasa visual konsisten meski nanti ada puluhan file KML dari sumber/operator berbeda dengan gaya styling asli yang berbeda-beda pula.

### 9.5 Popup Detail Fitur KML

Klik titik ODP/ODC → popup ringkas: nama, folder path (breadcrumb: "ODP > D.01"), `description_raw` ditampilkan apa adanya (preformatted, menghormati line-break asli). Klik segmen kabel → popup dengan `parsed_metadata` ditampilkan sebagai tabel key-value rapi (Fiber Length, Construction Status, Jumlah HP, dst) — di sinilah investasi parsing terstruktur di §1.2 langsung terasa manfaatnya dibanding ODC/ODP yang cuma teks mentah.

---

## 10. Keamanan & Middleware

Mengikuti pola granular yang **sudah ada** di `middleware.ts` untuk membedakan akses `/admin/tools/*` per tool (bukan blanket akses ke seluruh prefix):

```ts
const isHelpdeskToolsPath =
  pathname === '/admin/tools' ||
  pathname.startsWith('/admin/tools/war-map') ||
  pathname.startsWith('/admin/tools/import-kml');   // BARU — tapi read-only, enforced di level UI+API, bukan di middleware
```

- Halaman `/admin/tools/import-kml` sendiri **tetap admin/superadmin-only** di level API (`protectApi(['admin', 'superadmin'])` di route `preview`/`run`/`delete`) — konsisten dengan pola `import-tiket`. Middleware boleh mengizinkan `helpdesk` **melihat** War Map dengan layer KML yang sudah ada, tapi tombol upload/hapus disembunyikan di UI dan endpoint mutasi tetap ditolak di server kalau ada percobaan akses langsung.
- Validasi upload: cek file adalah XML well-formed sebelum diproses lebih jauh (cegah upload file sembarangan berekstensi `.kml` tapi isinya bukan XML valid — mis. mencegah potensi XXE/XML injection dengan **menonaktifkan external entity resolution** di parser, langkah wajib untuk parsing XML dari file upload manapun).
- Rate limit endpoint `preview`/`run`, pola sama seperti `import-tiket-preview`.

---

## 11. Rollout Plan

| Fase | Scope |
|---|---|
| **Fase 1** | Migrasi Prisma: `kml_layer`, `kml_sublayer`, `kml_feature` |
| **Fase 2** | Parser server-side (`fast-xml-parser`, pending approval §7.2) + endpoint `preview`/`run`/`status` |
| **Fase 3** | UI wizard import (`/admin/tools/import-kml`), reuse pola `ImportPreviewPanel`/`ImportResultPanel` |
| **Fase 4** | Endpoint `geojson` (bbox-filtered) + integrasi render di `WarMapClient.tsx` (layer GeoJSON baru, cache Redis) |
| **Fase 5** | Layer Manager UI (tab Filter/Layer desktop, bottom sheet mobile — §9.3) |
| **Fase 6 (opsional)** | Dukungan `.kmz`, endpoint edit/hapus layer, multi-file batch upload |

Feature flag: `KML_IMPORT_ENABLED`, mengikuti pola `WAR_MAP_ENABLED`/`GEOTAG_REQUIRED_ENABLED` yang sudah ada di `ecosystem.config.js`.

---

## 12. Open Questions

1. **Konfirmasi library parser** — `fast-xml-parser` (custom traversal, direkomendasikan, §7.2) atau ada preferensi lain?
2. **Lokasi storage file mentah** (§7.3) — proyek Anda pakai strategi apa saat ini untuk file upload lain (evidence foto teknisi, dsb)? Supaya KML disimpan konsisten di tempat yang sama (disk lokal aaPanel vs object storage eksternal).
3. **Refactor `FilterPanel` existing ke pola bottom sheet mobile** (§9.3) — apakah mau sekalian diseragamkan dengan Layer Manager baru, atau Layer Manager cukup ikut pola stack-di-atas yang sudah ada untuk konsistensi jangka pendek (lebih cepat dikerjakan, tapi kurang ideal secara UX dibanding usulan saya)?
4. **Dukungan KMZ** — apakah file-file KML operasional Anda yang lain (dari STO/ODC lain) kemungkinan besar dalam format `.kmz` (terkompresi), atau konsisten `.kml` polos seperti sample ini? Ini menentukan prioritas Fase 6.
5. **Konsistensi format `description`** — apakah semua file KML dari sumber Anda (kemungkinan berbeda operator/STO) mengikuti pola deskripsi yang sama persis seperti sample ini, atau bervariasi? Ini menentukan apakah regex key-value untuk kabel (§1.2) aman digeneralisasi ke semua file mendatang.

---

## 13. Ide Pengembangan Lanjutan

### 13.1 Rekonsiliasi ODP: Data Resmi KML vs Data Lapangan Teknisi
Ini sinergi kuat dengan `service_location`/`device_name` dari PRD geotagging sebelumnya (§12.2 di PRD itu, "auto-suggest ODP terdekat"). Begitu ada data ODP **resmi** dari KML (bukan cuma crowd-sourced dari histori tagging teknisi), War Map bisa cross-check: teknisi input `device_name = "ODP-RKT-FKT/01"` tapi titik geotag GPS-nya berjarak >100m dari lokasi resmi ODP itu di KML → flag "kemungkinan salah ODP atau GPS meleset" ke admin. Ini jauh lebih andal sebagai sumber kebenaran dibanding nearest-neighbor dari histori tagging semata.

### 13.2 Overlay Kepadatan Homepass (`Jumlah HP`) vs Kepadatan Gangguan
Field `Jumlah HP` dari kabel distribusi (jumlah homepass/rumah yang dilayani satu segmen kabel) bisa dikombinasikan dengan jumlah gangguan aktif di area yang sama → menghasilkan **rasio gangguan per homepass**, metrik yang lebih adil untuk membandingkan area padat vs area jarang penduduk saat menentukan prioritas perbaikan, dibanding cuma menghitung jumlah gangguan mentah.

---

## 14. Ringkasan Perubahan Kode

- `prisma/schema.prisma` — tambah `kml_layer`, `kml_sublayer`, `kml_feature`
- `app/api/war-map/kml-layers/preview/route.ts` — **baru**
- `app/api/war-map/kml-layers/run/route.ts` — **baru**
- `app/api/war-map/kml-layers/status/route.ts` — **baru**
- `app/api/war-map/kml-layers/route.ts` (GET list) — **baru**
- `app/api/war-map/kml-layers/[id]/geojson/route.ts` — **baru**
- `app/api/war-map/kml-layers/[id]/route.ts` (PATCH/DELETE) — **baru**
- `app/libs/kml/parser.ts` — **baru**, logic traversal Folder → Placemark → Point/LineString + regex key-value untuk description kabel
- `app/admin/tools/import-kml/page.tsx` + komponen wizard — **baru**, reuse struktur `ImportPreviewPanel.tsx`/`ImportResultPanel.tsx` dari `import-tiket`
- `app/admin/tools/war-map/components/WarMapClient.tsx` — tambah tab "Layer", state daftar layer aktif, render `<GeoJSON>` per sublayer tervisibel
- `app/admin/tools/war-map/components/LayerManagerPanel.tsx` — **baru**
- `middleware.ts` — extend `isHelpdeskToolsPath` untuk `/admin/tools/import-kml` (read-only enforcement di level API, bukan blok total)
- `package.json` — tambah `fast-xml-parser` (pending approval Anda, §7.2/§12.1)

Saya siap susun prompt eksekusi Fase 1 (migrasi schema + parser) begitu Anda jawab open questions di §12 — terutama soal library parser dan lokasi storage file.
