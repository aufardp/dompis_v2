# PRD — Alat Ukur Jarak & Estimasi Titik Putus (War Map)

- **Status**: Draft
- **Module**: War Map (`/admin/tools/war-map`)
- **Dibuat**: 2026-08-11
- **Rilis**: MVP (sesi peta) → v1.1 (opsional)
- **Referensi**: `PRD-War-Map-Geo-Tagging-Gangguan.md`, `PRD-War-Map-KML-Import-Layer.md`

---

## 1. Latar Belakang & Masalah

War Map saat ini hanya *visualisasi* sebaran gangguan + overlay skema KML (ODC/ODP/kabel). Saat helpdesk/teknisi menerima laporan gangguan (mis. hasil OTDR/OPM: *"putus ±1,2 km dari ODC"*), tidak ada cara cepat untuk **memetakan jarak itu ke peta** — mereka menebak/berhitung manual, sehingga **estimasi lokasi titik putus** lambat dan subjektif. Begitu pula ketika ingin tahu *seberapa jauh* dua titik jaringan (A→B) — tidak ada alat ukur.

## 2. Tujuan

1. Memberi alat ukur jarak antar titik di peta — **garis lurus (geodesik)** dan **sepanjang jalur kabel KML**.
2. Memberi alat **estimasi titik putus**: masukan jarak dari titik referensi → sistem menandai estimasi lokasi putus di sepanjang kabel.
3. Menjadi alat bantu operasional cepat (estimasi lokasi gangguan) tanpa menambah beban data (sesi peta saja).

## 3. Persona & Use Case

- **Helpdesk/Admin (non-superadmin)**: menerima info "putus di 1,2 km dari ODC-RKT-FKT/01" → tandai kabel terkait, input jarak → dapat koordinat estimasi untuk koordinasi teknisi.
- **Teknisi / senior_leader / admin_branch**: mengukur jarak titik gangguan ke ODC/ODP terdekat (mode kabel) untuk memperkirakan jarak tempuh / section kabel yang rusak.
- **Superadmin**: sama, melintasi seluruh workzone.

Semua role `WAR_MAP_ROLES` dapat memakai alat. Data yang diukur otomatis ter-scope workzone (alat bekerja di atas data yang sudah tampil di peta — tidak ada jalur data baru).

## 4. User Stories

| ID | Sebagai | Saya ingin | Agar |
|----|---------|-----------|-----|
| US-1 | user peta | mengaktifkan "Ukur Jarak" lewat tombol toolbar | mulai mengukur cepat |
| US-2 | user peta | klik titik-titik di peta dan melihat jarak kumulatif antar titik (garis lurus) | mengetahui estimasi jarak A→B |
| US-3 | user peta | mengukur jarak **sepanjang kabel KML** yang saya klik (bukan garis lurus) | jarak realistis mengikuti rute kabel |
| US-4 | user peta | meng-undo titik terakhir, membersihkan, dan menyelesaikan pengukuran | mengontrol hasil |
| US-5 | user peta | memilih kabel + titik referensi (mis. ODC) + input jarak putus (m/km) | sistem menandai estimasi titik putus |
| US-6 | user peta | melihat rincian segmen & total jarak, plus koordinat/arah estimasi putus | keputusan cepat & dokumentasi manual |

## 5. Cakupan

### 5.1 In-scope (MVP)
- Tombol toolbar "Ukur Jarak" + mode aktif.
- Mode **Garis Lurus**: polyline + label jarak per segmen & total (m/km).
- Mode **Sepanjang Kabel**: snap ke kabel KML yang tampil; jarak = panjang jalur kabel antara dua titik (mengikuti geometri kabel).
- **Estimasi Titik Putus**: pilih kabel → klik titik referensi → input jarak → marker estimasi di `distance` sepanjang kabel dari referensi; opsi arah (dari awal kabel / dari referensi menuju ujung kabel).
- Panel readout (sticky), tombol Undo / Clear / Selesai, indikator mode aktif & kursor crosshair.
- **Sesi peta saja**: hasil hilang saat reload/unmount.

### 5.2 Out-of-scope (non-goal / v1.1)
- Menyimpan pengukuran ke database.
- Menghitung rute multi-kabel (path finding antar kabel).
- Mengukur luas area/polygon.
- Download/export hasil.
- Estimasi berbasis nilai atenuasi OTDR (hanya jarak linear).

## 6. Spesifikasi Fungsional

### 6.1 Aktivasi & Mode
- Tombol toggle "Ukur Jarak" (ikon ruler) di toolbar peta (desktop & mobile sheet).
- Saat mode aktif: kursor crosshair; klik peta = tambah titik; klik marker titik/kabel **tidak** membuka popup atau select (di-suppress selama mode aktif).
- Dua mode pengukuran dipilih di panel: **Garis Lurus** | **Sepanjang Kabel** (default: Garis Lurus). Tombol "Estimasi Titik Putus" membuka sub-mode kabel khusus.

### 6.2 Mode Garis Lurus
1. Klik peta → tambah vertex (CircleMarker kecil) + segmen Polyline putus-putus warna aksen.
2. Setiap segmen: jarak geodesik (haversine) antar vertex; label jarak di tengah segmen (divIcon kecil).
3. Panel readout menampilkan **Total** (jumlah semua segmen) & daftar segmen (1→2, 2→3, ...).
4. Double-click atau tombol **Selesai** → finalisasi (polyline solid, label tetap); dapat di-extend dengan klik lanjutan sampai **Clear**.
5. **Undo** menghapus vertex terakhir; **Clear** me-reset seluruhnya.
6. Batas vertex per sesi: **50** (konstanta, mudah diubah).

### 6.3 Mode Sepanjang Kabel
1. Klik pertama harus **menyentuh kabel KML** (dalam radius snap). Sistem men-set anchor = proyeksi titik klik pada kabel itu dan **mengunci** pengukuran ke kabel tersebut (`cableId`).
2. Klik berikutnya di titik lain → proyeksikan ke kabel yang sama; jarak segmen = **selisih jarak-kumulatif sepanjang polyline** (bukan garis lurus). Portion kabel yang diukur di-highlight.
3. Klik di luar kabel terpilih (kabel lain / area kosong): diabaikan + hint "Tetap di kabel {nama}". Meng-klik kabel lain → reset anchor ke kabel baru.
4. Label & readout sama seperti mode lurus, tetapi total = panjang jalur kabel.
5. Perhitungan mengikuti seluruh vertex kabel (termasuk belokan).

### 6.4 Estimasi Titik Putus
1. Masuk mode → pilih kabel (klik pada kabel).
2. Tentukan titik referensi:
   - **Default**: titik awal kabel (atau ODC yang menempel di ujung kabel bila tersedia).
   - **Manual**: klik titik pada kabel sebagai referensi.
3. Input jarak putus (angka, satuan **m** atau **km**) dan arah:
   - **Dari awal kabel** (`from_start`).
   - **Dari referensi menuju ujung kabel** (`from_reference`) — default dari awal.
4. Sistem menghitung `pointAlongPolyline(cable, cumulativeDistance)` → marker khusus (ikon putus, warna merah/ambar) + label:
   - `Estimasi putus: {jarak} dari {referensi}`,
   - koordinat lat/lng (6 desimal),
   - jarak sisa ke ujung kabel.
5. Jika jarak melebihi panjang kabel → peringatan "Jarak melebihi panjang kabel ({panjang})" dan posisi di-clamp ke ujung kabel (opsi batal).
6. Layer estimasi terpisah; dapat di-clear tanpa menghapus pengukuran garis.

### 6.5 Snap & Hint
- **Radius snap**: 12 px pada zoom aktif (dikonversi ke derajat via scale map).
- Prioritas snap: (1) vertex/titik ODC-ODP (presisi), (2) titik gangguan (`service_location`), (3) proyeksi segmen kabel.
- **Hover hint** (nice-to-have v1.1): saat mode aktif, kabel yang disentuh kursor diberi "glow" sebagai kandidat snap.

### 6.6 Satuan & Format
- `< 1 km` → meter (`1.240 m`); `≥ 1 km` → km 3 desimal (`1,240 km`, locale `id-ID`).
- Koordinat estimasi: `-7.183100, 112.711700` (6 desimal).

## 7. Desain UI (deskripsi)

- **Toolbar**: tombol bulat ikon ruler; active-state warna indigo; berdampingan dengan toggle Skema/Filter.
- **Panel readout**: chip/panel melayang (kanan-bawah desktop, atas bottom-sheet mobile) berisi:
  - mode aktif,
  - total jarak (besar/bold),
  - daftar segmen,
  - tombol **[Undo] [Clear] [Selesai]**,
  - blok "Estimasi titik putus": nama kabel terpilih, input jarak + satuan, radio arah, tombol **Tandai**.
- **Overlay peta**: Polyline aksen indigo putus-putus; vertex CircleMarker kecil; label segmen divIcon kecil; marker estimasi = pin merah berlabel.
- **Kursor**: crosshair saat mode aktif.

## 8. Alur

```
Aktivasi → pilih mode
  ├─ Garis Lurus: klik → vertex → segmen → label → [Selesai]
  ├─ Kabel: klik kabel → terkunci → klik lanjut → panjang jalur → [Selesai]
  └─ Estimasi: pilih kabel → referensi → input jarak → Tandai → marker putus
Semua mode: [Undo] / [Clear] kapan saja; keluar mode → layer ukur dihapus.
```

**Error handling**:
- Klik di luar kabel (mode kabel) → hint "Tetap di kabel {nama}".
- Jarak > panjang kabel → warning + clamp ke ujung.
- Tidak ada kabel tampil (mode kabel) → tombol disabled + pesan "Tidak ada kabel tampil untuk mode ini".

## 9. Spesifikasi Teknis

**Tumpukan**: `react-leaflet` v5 + `leaflet` v1.9 (sudah terpasang). **Tanpa dependency baru** — geometri ditulis sendiri (kecil & terkontrol). Alternatif tercatat (opsional, tidak wajib): `leaflet-geometryutil`, `@turf/turf`.

**File baru**:
- `app/libs/warmap/measure.ts` — utilitas geometri:
  - `haversineKm(a, b)` — reuse dari `app/libs/kml/geo.ts`.
  - `projectPointOnSegment(p, a, b)` & `pointToSegmentDistanceKm(p, a, b)`.
  - `cumulativeLengthsKm(coords)` — jarak kumulatif antar vertex (haversine).
  - `distanceBetweenAlongPolyline(coords, sA, sB)` — panjang jalur antara dua nilai-kumulatif.
  - `pointAlongPolyline(coords, targetKm)` — interpolasi segmen → `[lat, lng]`.
  - `initialBearing(a, b)` — opsional (mode lurus).
- `app/admin/tools/war-map/components/useMeasure.ts` — state machine + logika snap.
- `app/admin/tools/war-map/components/MeasureTool.tsx` — tombol toolbar + state.
- `app/admin/tools/war-map/components/MeasurePanel.tsx` — readout & input estimasi.
- `app/admin/tools/war-map/components/MeasureLayer.tsx` — Polyline/vertex/label/marker overlay.

**Integrasi `WarMapClient.tsx`**:
- `useMapEvents({ click })` aktif saat mode mengukur.
- Suppress popup/select marker & kabel via flag ref (tidak ada regresi saat mode non-aktif).
- Overlay dirender di dalam `MapContainer`.

**State**:
```ts
type MeasureMode = 'line' | 'cable' | 'estimate';

interface MeasureState {
  mode: MeasureMode;
  vertices: [number, number][];   // [lat, lng] (snapped)
  cableId: number | null;          // kabel terkunci (mode cable/estimate)
  reference: [number, number] | null;
  estimateMeters: number | null;
  direction: 'from_start' | 'from_reference';
}
```

**Performa**: O(n vertex kabel) per klik; `n` orde ratusan → aman tanpa memo berat. Kabel hanya kandidat dari skema KML yang sedang tampil (`layerVisible ∧ sublayerVisible`).

## 10. Acceptance Criteria

- [ ] Tombol Ukur aktif → klik area kosong menambah vertex; klik marker/kabel tidak membuka popup.
- [ ] Mode lurus: total jarak benar (banding manual haversine) untuk ≥ 3 vertex.
- [ ] Mode kabel: jarak mengikuti geometri kabel (termasuk belokan), bukan garis lurus.
- [ ] Estimasi: `pointAlongPolyline` menempatkan marker pada jarak yang benar (uji: tengah segmen, tepat di vertex, ujung kabel).
- [ ] Jarak > panjang kabel → warning + clamp; input satuan m & km benar.
- [ ] Undo / Clear / Selesai bekerja; keluar mode menghapus semua layer ukur.
- [ ] Tidak ada regresi klik/select popup saat mode non-aktif.
- [ ] `tsc --noEmit` bersih; unit test geometri (`scripts/test-measure.ts`) lulus.

## 11. Risiko

- Kabel KML bisa memiliki koordinat jarang/arah tidak konsisten → hasil bersifat **estimasi**; diberi label "estimasi" di UI.
- Konflik event klik dengan popup marker → dimitigasi suppress-by-mode + flag ref.
- Akurasi bergantung kualitas geometri KML hasil impor.

## 12. Fase Rilis

| Fase | Isi | Keterangan |
|------|-----|-----------|
| **MVP** | Mode garis lurus + sepanjang kabel + estimasi titik putus (sesi), snap dasar, panel readout | Rilis utama sesuai PRD ini |
| **v1.1 (opsional)** | Hover snap hint, penyimpanan hasil ke DB, rute multi-kabel, export | Dipisah, butuh model/data baru |
