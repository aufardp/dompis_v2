# PRD — War Map v2: Render KML Fidelity + ODP Disturbance Alert

## A. Latar Belakang & Akar Masalah (evidence)

| # | Keluhan | Akar masalah | Lokasi |
|---|---------|--------------|--------|
| 1 | **Garis kabel tidak tampil** | Koordinat garis tersimpan sebagai `[lng, lat]` (GeoJSON), tapi Leaflet `Polyline` butuh `[lat, lng]`. Garis digambar **terbalik** → jatuh di luar layar, praktis "tidak tampil". | `WarMapClient.tsx:613` (`positions=feature.coordinates`) ← `WarMapClient.tsx:1037` (copy dari `geometry.coordinates`) |
| 2 | **Warna tidak sesuai asli** | Parser hanya memakai `IconStyle.color` sebagai fill flat. Padahal warna asli ikon dikodekan di **nama file** (`grn-stars`, `wht-stars`, `ylw-pushpin`, `shaded_dot`) dan `IconStyle.color` itu **tint perkalian**, bukan isi. Akibat: `grn-stars` (hijau asli) → abu/indigo; `ylw-pushpin` (kuning) → abu; `shaded_dot color=ff000000` → **hitam pekat tak terlihat**. | `parser.ts:100-113` (`buildStyleResolver`), `WarMapClient.tsx:198-217` (`kmlIcon`) |
| 3 | **Detail tidak tampil** | (a) Tidak ada **label nama** di bawah ikon (Google Earth menampilkan label); (b) `description` ditampilkan mentah apa adanya tanpa rapi; (c) tidak ada hover tooltip cepat. | `WarMapClient.tsx:567-611` (`KmlPointMarker`) |
| 4 | Kualitas visual "tidak enak dilihat" | Ikon SVG star/pushpin flat sederhana & netral; tanpa basemap satelit; tanpa legenda; tanpa insight jaringan. | Seluruh render KML |

**Fakta file asli `plans/ODC-RKT-FKT.kml`** (verified): 335 placemark; gaya kabel `color=ffff0000`→`#0000ff` (biru) width 5, `ff00ff00`→hijau, `ff0055aa`→oranye-coklat; ikon `grn-stars`(2), `wht-stars`(8), `ylw-pushpin`(4), `shaded_dot`(2), `square`(2), `triangle`(2, tint `#ff0000`); sublayer: ODC-RKT-FKT(1 pt) / ODP(59 pt) / DISTRIBUSI(62 line) / TIANG(138 pt) / GALIAN(75 mix). Data lama di DB harus **di-import ulang** agar bentuk fixed.

---

## B. Goals / Non-Goals

**Goals**
1. Tampilan KML mendekati Google Earth: warna kabel & ikon akurat, garis tampil benar, label & detail rapi.
2. ODP otomatis diberi **peringatan (badge + pulsing)** bila banyak titik gangguan di sekitarnya, dengan daftar gangguan di popup → panduan pengecekan lokasi.
3. Visual premium: basemap satelit, legenda jaringan, insight ribbon, fit-ke-jaringan.

**Non-Goals**: tidak mengubah pipeline ingestion/data-worker; tidak menambah backfill bridge; alert TIDAK menggenerate tiket otomatis (hanya panduan).

---

## C. Desain Fase A — Fix Render KML Fidelity

### A1. Fix garis kabel (bug kritis)
- `KmlLinePolyline`: konversi posisi `([lng,lat]) => [lat,lng]` sebelum render.
- Plus polish: `opacity 0.85` → `1` + `weight+1` saat hover (interactive styling `eventHandlers mouseover/mouseout`).
- Popup garis: tampilkan tabel metadata (sudah ada) + snippet `descriptionRaw` jika bukan format Key:Value.

### A2. Fidelity warna ikon (parser + client)
**Parser** (`parser.ts` + re-import):
- Ekstrak nama file href → tentukan **bentuk & warna dasar**:
  - `*-stars*` → shape `star`, base `wht`→`#ffffff` / `grn`→`#34a853`
  - `ylw-pushpin` → `pushpin`, base `#fbc04d`
  - `shaded_dot` → `dot`, base gelap `#555555`
  - `square` → base `#b3a1e6`, `triangle` → base `#e1b53e`
- `IconStyle.color` (tint) **dikalikan** ke base warna (channel-wise, abaikan bila `ffffffff`); tint `ff000000` → gelapkan (×0.55) bukan hitam.
- Simpan **`icon_color` final** (hasil). Bentuk tetap di `icon_key`. **TANPA kolom baru** → cukup re-import.
- `kmlColorToHex` tetap (= urutan rrggbb dari aabbggrr) — sudah benar.

**Client** (`kmlIcon`):
- Pakai `icon_color` final; `star` digambar sebagai **paddle gaya Google** (banner rounded + bintang) agar tidak flat, `pushpin` ikut serta bentuk label bintang.
- Tambahkan **label nama icon** (nama ODP/ODC) di divIcon bila `zoom >= 12` → tampil label di bawah ikon (ini mengatasi "detail tidak tampil").

### A3. Detail & UX
- **Hover tooltip** cepat (nama + sublayer) via `Tooltip` Leaflet pada point & garis.
- `visibility` KML `0` dihormati (opsional toggle "tampilkan tersembunyi").
- Simpan kolom `note`/`construction_status` popup sudah ada — rapikan layout popup (grid 2 kolom metadata, badge status).

### A4. Legenda & Basemap
- Panel **Legenda** kecil (card kanan-bawah desktop/sheet mobile): warna sublayer garis (ODC biru, kabel status), ikon ODP/ODC/TIANG, status alert.
- Toggle **basemap**: OSM peta vektor ↔ **Satelit ESRI** (`server.arcgisonline.com/World_Imagery`) — sangat membantu melihat rute fiber.
- Tombol **"Lihat jaringan"**: `map.fitBounds(kmlLayer.bbox)` zoom ke seluruh network.
- **Insight ribbon**: jumlah ODP berisiko (merah/kuning), jumlah titik gangguan aktif di viewport, jumlah ODP dievaluasi.

---

## D. Desain Fase B — ODP Disturbance Alert

### B1. Deteksi node (tanpa perubahan skema)
- Bangun `odpSublayerIds` dari `kmlLayers.sublayers` (folderPath match `/^ODP/i` atau berisi `ODP`, geometryKind point). Identik utk ODC (`/ODC/i`) → prioritas alert utama di ODP, ODC ikut dihitamkan opsional.
- Klasifikasi dilakukan **client-side** (data `kmlLayers` lengkap sudah ada) → tidak perlu migration/re-import.

### B2. Komputasi alert (lib baru `app/libs/kml/geo.ts`)
- `haversineKm(a,b)`.
- `computeOdpAlerts(odpPoints, disturbances, opts)`:
  - Untuk tiap ODP: hitung **jumlah tiket unik** (`service_no` unique, satu titik = satu `service_location`) dalam `radiusKm` (default **1 km**, configurable 0.5/1/2).
  - **Tier berbasis hitungan tiket** (kesepakatan 11-Agu-2026): `CRITICAL (merah)` ≥ **6**; `WARNING (kuning)` ≥ **4**; sisanya `NORMAL`. Dedup per `service_no`.
  - Output: `[{ odpId, name, lat, lng, tier, totalPoints, activeCount, hotCount, nearby: [serviceNo, customerName, distanceKm, status, incident] }]`.
- Jarak haversine murni (earth radius 6371); hasil `useMemo` dep `[points, kmlPoints, radiusKm]`. Prefilter kotak-batas ±0.02° sebelum haversine utk perf.

### B3. UI Alert
- **Badge** bulat merah/kuning + efek **pulse** (CSS `animate-ping`) di atas ikon ODP berisiko, `zIndexOffset` tinggi agar menang dari cluster gangguan.
- **Popup ODP diperkaya**: nama, peringkat tier, ringkasan (X gangguan, Y aktif, Z berulang), **tabel daftar gangguan sekitar** (nama pelanggan di-mask seperti pola yang ada, jarak, status, incident → `onOpenDetail`).
- Toggle di panel Layer: **"Peringatan ODP"** + select radius (500m/1km/2km).
- **Insight ribbon**: "🔴 3 ODP berisiko · 🟡 5 ODP waspada" (klik → zoom ke ODP berisiko terdekat).

### B4. Params (constant, tunable)
```ts
const ODP_ALERT_RADIUS_KM = 1;
const ODP_ALERT_CRITICAL_SCORE = 6;
const ODP_ALERT_WARN_SCORE = 3;
// bobot: active=3, hot=2, lainnya=1
```

---

## E. Files Yang Disentuh

| File | Aksi |
|------|------|
| `app/libs/kml/parser.ts` | final `icon_color` (base+tint), `icon_key` tetap; export util `iconBaseFromHref` |
| `app/libs/kml/geo.ts` | **baru** — haversine + `computeOdpAlerts` |
| `app/api/war-map/kml-layers/run/route.ts` | tak berubah signifikan (memanfaatkan `icon_color` baru dari parser) |
| `app/admin/tools/war-map/components/WarMapClient.tsx` | fix line [lat,lng], `kmlIcon` paddle+label, tooltip, alert state/useMemo, badges, legend card, basemap toggle, ribbon, fit-network |
| `app/admin/tools/war-map/components/LayerManagerPanel.tsx` | toggle Peringatan ODP + radius (diteruskan ke parent) |
| `app/libs/kml/client-types.ts` | type alert `OdpAlert` (di WarMapClient atau file ini) |

## F. Migrasi & Rollout
- **Tidak ada migration DB baru** (Fase A via re-import; Fase B client-side). Bila ingin persistensi klasifikasi node → opsional kolom `node_role` (terpisah, additive).
- Langkah: (1) implementasi parser → (2) **re-import `plans/ODC-RKT-FKT.kml`** via `/admin/tools/import-kml` → (3) dev server restart → (4) verifikasi.

## G. Test Plan
1. `npm run typecheck` & `npm run lint` (wajib hijau; hanya artefak `dist-workers` pre-existing).
2. `npm run build` — route KML tetap terdaftar.
3. QA visual checklist: kabel biru/hijau terlihat on-position; ODC/ODP ikon beda warna sesuai file; label muncul saat zoom ≥12 dalam; radius alert 1km memunculkan badge di ODP yang memang dikelilingi titik; popup alert menampilkan daftar gangguan; toggle basemap satelit; fit-network zoom penuh.
4. Regression: filter gangguan (bucket/workzone/hotOnly) tetap berfungsi dan alert ikut-sesuai-filter.

## H. Milestone
- **M1** (kritis): fix garis + fidelity warna + re-import → close keluhan #1 #2.
- **M2**: label & detail popup + legenda + basemap + fit-network.
- **M3**: ODP alert (lib+UI+ribbon) → close fitur #2.
- **M4** (opsional): node_role migration, insight lanjutan (mis. downstream statistik per ODC/ODP).