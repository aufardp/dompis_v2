# PRD — Penyempurnaan UX Teknisi, Filter Branch, Security/Performance Hardening, Overview Redesign & Fitur Lanjutan
**Produk:** Dompis v2 — Telkom Akses Area 3 (Suramadu)
**Versi Dokumen:** 1.0
**Disusun:** berdasarkan audit langsung codebase terbaru (`app`, `lib`, `plans`) + 2 screenshot yang Anda kirim
**Status:** Gabungan 5 permintaan — masing-masing independen, bisa dieksekusi terpisah sesuai prioritas Anda

---

## 0. Ringkasan Audit — Temuan Kunci per Topik

Sebelum masuk ke masing-masing dari 5 poin, ini temuan konkret dari audit yang **langsung membentuk rekomendasi di bawah**:

| # | Temuan | Dampak |
|---|---|---|
| 1 | `LocationTagger.tsx` (608 baris) dan `AddressEditor.tsx` (335 baris) **sudah terimplementasi penuh** sesuai PRD geotagging sebelumnya — state machine idle/confirm/editing/filled, mini-map draggable, scan barcode, semua sudah ada | Baseline sudah solid — perbaikan yang dibutuhkan sekarang **integrasi antar dua komponen ini**, bukan membangun ulang (§1) |
| 2 | **`Permissions-Policy` header di `request-security.ts` memblokir `camera=()` dan `geolocation=()` untuk seluruh origin** | 🔴 **Kritis** — ini berpotensi membuat `navigator.geolocation.getCurrentPosition()` di `LocationTagger` dan kamera di `Scanner` (barcode) **gagal difungsikan browser**, tepat di fitur yang baru dibangun (§3.1) |
| 3 | `QOSMIC_BRIDGE_TOKEN` tersimpan **plaintext** di `ecosystem.config.js` (ter-commit ke repo, terduplikasi di 3 app config) | Risiko kebocoran credential lewat git history / akses read repo (§3.2) |
| 4 | `/admin/rekap-workorder`, `/helpdesk/rekap-workorder`, `/superadmin/rekap-workorder` — 3 route shell nyaris identik (beda cuma role-guard), tapi **sudah** memakai satu `RekapWorkorderClient.tsx` bersama | Sebagian bagus (client tidak terduplikasi), tapi shell page.tsx tetap technical debt (§3.3) |
| 5 | `/api/branch` **hanya bisa diakses `superadmin`** (dipakai untuk CRUD branch, bukan reference-data) — beda dengan `/api/workzone`/`/api/area`/`/api/region` yang lebih terbuka dan sudah di-cache di middleware | Filter branch baru (poin 2) **tidak bisa numpang endpoint ini langsung** — perlu endpoint reference-data baru (§2.2) |
| 6 | Topbar (`Topbar.tsx`) sudah py pola dropdown workzone yang matang (`useWorkzoneOptions`, styling konsisten) tapi **filter itu di-passing per-halaman** (`onWorkzoneChange` di-handle beda-beda tiap page — Overview, Bucket, Group, Semesta), bukan state global | Filter branch baru mengikuti pola pemasangan per-halaman yang sama, bukan "sekali pasang berlaku semua" (§2.3) |
| 7 | Halaman Durasi (`DashboardDurasiClient.tsx`) & Rekap Workorder **saat ini scoping datanya murni dari role/session** (`SCOPE: admin` statis, lihat screenshot 2) — belum ada filter manual sama sekali di kedua halaman ini | Ruang kosong di UI (kotak merah Anda) memang belum terisi apa pun — bukan bug rendering, tapi memang fitur belum dibangun (§2.4) |
| 8 | `TicketManagementOverviewPage.tsx` (964 baris) murni snapshot angka **saat ini saja** — tidak ada tren, tidak ada perbandingan periode, tidak ada highlight risiko SLA | Ruang improvement besar untuk §4 |

---

## 1. UX Teknisi — Alamat & Tagging Lokasi yang Tidak Menyusahkan

### 1.1 Masalah dengan Kondisi Saat Ini

`AddressEditor` dan `LocationTagger` **sudah bagus secara individual**, tapi keduanya **dua komponen terpisah yang tidak saling tahu** — teknisi harus:
1. Isi alamat (ketik manual, textarea kosong, tidak ada bantuan apa pun selain placeholder contoh)
2. Scroll/pindah ke bagian lain, tag lokasi (ambil GPS, koreksi manual di mini-map, scan barcode)

Padahal **kedua data ini berkorelasi langsung**: begitu GPS diambil di `LocationTagger`, itu adalah **informasi terkuat** untuk membantu isi alamat — tapi saat ini tidak dimanfaatkan sama sekali. Teknisi tetap harus mengetik alamat lengkap dari nol, murni mengandalkan hafalan/tanya pelanggan, padahal titik GPS sudah didapat.

### 1.2 Redesain — Satu Alur, Bukan Dua Field Terpisah

**Usulan: gabungkan urutan kerja jadi satu alur "Lokasi & Alamat" (bukan menghapus dua komponen, tapi mengubah urutan & menghubungkan datanya):**

```
Langkah 1: [Ambil Lokasi Saat Ini] ← selalu jadi entry point pertama, bukan alamat
     ↓
   GPS didapat → mini-map muncul, marker bisa digeser koreksi
     ↓
Langkah 2: Reverse-geocoding ringan (Nominatim OSM, gratis, self-hosted-friendly)
     → Muncul sebagai SARAN alamat, bukan auto-fill paksa:
       "📍 Perkiraan alamat: Jl. Tenggilis Utara II, Surabaya — [Pakai sebagai draft] [Isi manual]"
     ↓
Langkah 3: Textarea alamat (AddressEditor existing) — kalau teknisi pilih "Pakai sebagai draft",
   textarea terisi otomatis dengan hasil reverse-geocode, TETAP bisa diedit/dilengkapi
   (mis. tambah "rumah cat hijau, sebelah warung") — reverse geocode jarang 100% presisi
   sampai level rumah, jadi teknisi tetap perlu menyempurnakan, bukan menggantikan penilaian
   lapangan mereka
     ↓
Langkah 4: Barcode DC (scan/manual) — tidak berubah dari LocationTagger existing
```

**Kenapa urutan dibalik (lokasi dulu, baru alamat)?** Karena GPS adalah data paling cepat & paling objektif untuk didapat teknisi di lapangan (satu tap), sementara mengetik alamat lengkap dari nol adalah tugas yang paling memakan waktu & rawan typo. Membalik urutan berarti alamat **berangkat dari draft**, bukan dari kertas kosong — ini pengurangan beban kerja paling besar yang bisa diberikan tanpa mengubah data model.

### 1.3 Perbaikan Mikro-UX Tambahan (Cepat Dikerjakan, Dampak Nyata)

1. **Riwayat alamat per `service_no`** — sama seperti bank data lokasi (`service_location`) yang sudah ada, `alamat` yang tersimpan di sana **seharusnya jadi draft default** juga saat `AddressEditor` dibuka untuk `service_no` yang sudah pernah ditag — saat ini `AddressEditor` fetch dari `/api/tickets/{id}/detail` (field `alamat` ticket saat ini), **bukan** dari bank lokasi. Untuk gangguan berulang di pelanggan yang sama, teknisi tetap harus ketik ulang alamat meski GPS-nya sudah dikenal — celah kecil yang gampang ditambal: satu query tambahan yang sudah ada infrastrukturnya (`location-bank` endpoint sudah ada dari fitur geotagging).
2. **Voice-to-text untuk alamat** — `<textarea>` biasa bisa langsung memanfaatkan `webkitdictation`/Web Speech API sebagai tombol mikrofon kecil di pojok textarea, opsional (fallback ketik tetap ada) — sangat membantu teknisi yang sedang berdiri di lapangan sambil pegang alat kerja, tidak perlu mengetik dengan dua tangan.
3. **Target sentuh lebih besar & feedback haptic-friendly** — tombol-tombol existing (`h-10`, `h-11`) sudah cukup besar untuk mobile, ini sudah baik, tidak perlu diubah.
4. **Resiliensi offline** (sudah pernah saya usulkan di PRD geotagging §12.8, sekarang lebih mendesak karena fitur sudah live) — kalau submit close gagal karena sinyal Suramadu putus di titik tertentu, form JANGAN reset. Simpan draft di `sessionStorage`/state lokal, auto-retry submit begitu koneksi kembali, dengan indikator jelas "Tersimpan lokal, menunggu sinyal untuk kirim" — supaya teknisi tidak perlu mengulang GPS+scan dari nol.
5. **Satu tombol besar "Selesai Tag Lokasi & Alamat"** di akhir alur gabungan (bukan dua tombol simpan terpisah seperti sekarang: "Simpan Alamat" di `AddressEditor` dan "Simpan Lokasi" di `LocationTagger`) — mengurangi jumlah keputusan/tap yang harus dibuat teknisi dari 2 submit jadi 1.

### 1.4 Yang **Tidak** Perlu Diubah

State machine idle/confirm/editing/filled di `LocationTagger` **sudah tepat** — jangan dirombak, cukup direposisi urutannya relatif ke `AddressEditor` dan dihubungkan datanya sesuai §1.2. Barcode scanner (`@yudiel/react-qr-scanner`) sudah punya fallback manual yang baik — tidak ada perubahan diperlukan di situ.

---

## 2. Filter Branch — Header Global, Durasi, Rekap Workorder, Detail WO HI

### 2.1 Apa yang Diminta, Persis

Dari screenshot Anda: kotak kosong di sebelah tombol "Enter" pencarian header (screenshot 1), dan kotak kosong di sebelah tombol "Refresh" halaman Durasi (screenshot 2) — keduanya **tempat yang wajar untuk dropdown filter tambahan**, konsisten posisinya dengan dropdown "All Workzone" yang sudah ada di header.

### 2.2 Data Layer — Endpoint Reference Baru (Wajib, Bukan Opsional)

`/api/branch` **tidak bisa dipakai langsung** untuk filter ini (§0 poin 5) — dia `superadmin`-only dan bertujuan CRUD, bukan lookup ringan lintas-role. Perlu endpoint baru:

```
GET /api/branch/options
  Role: semua role yang berhak lihat data (admin, helpdesk, superadmin, senior_leader, admin_branch)
  Return: [{ value: string, label: string, regionId: number }]
  Scoping: sama seperti getBranchScope() yang sudah dipakai /api/branch — admin_branch
           hanya lihat branch miliknya, superadmin lihat semua
```
Ditambahkan ke middleware cache whitelist (`pathname === '/api/branch/options'`) — persis pola `/api/area`/`/api/region`/`/api/workzone` yang sudah ada (`Cache-Control: private, max-age=300, stale-while-revalidate=600`).

### 2.3 Header Global (Topbar) — Screenshot 1

Tambahkan dropdown "Branch" **di sebelah kiri** dropdown "All Workzone" existing (urutan logis: Branch → Workzone, karena satu branch menaungi banyak workzone — filter branch harusnya mempersempit pilihan workzone, bukan sebaliknya):

```tsx
// Topbar.tsx — pola identik dgn <select> workzone yang sudah ada, ditambah sebelum itu
<div className='relative hidden lg:block xl:block'>
  <select value={branch} onChange={handleBranchChange} disabled={branchLoading}
    className='bg-surface hover:bg-surface-2 appearance-none rounded-2xl border ...'>
    <option value=''>All Branch</option>
    {branchOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
  </select>
  <ChevronDown className='...' />
</div>
```

**Perilaku cascading:** saat Branch dipilih, dropdown Workzone di sebelahnya otomatis difilter (`useWorkzoneOptions(branch)` — hook sudah ada, tinggal terima parameter opsional `branchId` yang diteruskan ke `/api/workzone?branchId=`). Kalau Workzone yang sedang aktif tidak lagi valid untuk Branch baru, reset ke `''` (All Workzone dalam branch itu) — supaya tidak terjadi state kontradiktif (workzone terpilih padahal branch-nya sudah beda).

**Konsisten dengan pola existing:** `onBranchChange` di-passing ke tiap halaman **persis seperti `onWorkzoneChange` sekarang** (§0 poin 6) — bukan state global tersentralisasi. Ini keputusan sadar untuk konsistensi arsitektur (tidak menciptakan dua pola berbeda untuk dua filter yang mirip), meski artinya tiap halaman (Overview, Bucket, Group, Semesta, Durasi, Rekap Workorder) perlu menerima & meneruskan `branch` sendiri-sendiri ke API-nya masing-masing.

### 2.4 Halaman Durasi Tiket Open — Screenshot 2

Posisi kotak kosong di screenshot **sejajar dengan timestamp & tombol Refresh** — tempat pas untuk dropdown Branch versi ringkas (compact, tanpa label "All Branch" penuh, cukup ikon + nama terpilih, karena ruang di baris itu sempit):

```
[● 10/08/2026, 14.54.18 WIB] [🔄 Refresh]     →     [🏢 Branch: Semua ▾] [🔄 Refresh]
```
Ditambahkan sebagai prop baru `branch`/`onBranchChange` ke `DashboardDurasiClient.tsx`, diteruskan sebagai query param ke `/api/dashboard/durasi` (endpoint perlu extend untuk terima & filter `branch`, mengikuti pola `workzone` scoping yang sudah dipakai di dashboard lain seperti Dashboard Durasi Assurance/Rekap Workorder).

### 2.5 Rekap Workorder — Semua 3 Role Sekaligus (Free, karena Shared Client)

Karena `RekapWorkorderClient.tsx` **sudah** dipakai bersama oleh `admin`, `helpdesk`, `superadmin` (§0 poin 4), menambah filter Branch di `BucketFilterBar` (komponen internal yang sudah ada di file yang sama) otomatis muncul di ketiga role **tanpa perlu ubah 3 file page.tsx terpisah** — cukup satu titik perubahan. Ini keuntungan nyata dari arsitektur shared-client yang sudah benar di proyek Anda.

### 2.6 Detail WO HI

`DetailWoHiClient.tsx` + endpoint `/api/tickets/daily/detail-wo-hi` — tambahkan filter Branch dengan pola yang sama, diletakkan sejajar filter tanggal/workzone yang kemungkinan sudah ada di panel filter halaman itu (perlu saya lihat lebih detail struktur `DetailWoHiClient.tsx` — saya sarankan Anda kirim isi file itu kalau ingin saya buatkan spesifikasi UI persis, karena saya belum sempat membedahnya sedalam file lain di audit ini).

---

## 3. Security & Performance — Temuan & Rekomendasi

### 3.1 🔴 Prioritas Tertinggi — Permissions-Policy Memblokir Geolocation & Camera

```js
// request-security.ts — SAAT INI
response.headers.set(
  'Permissions-Policy',
  'camera=(), microphone=(), geolocation=(), interest-cohol=()',
);
```
`camera=()` dan `geolocation=()` berarti **tidak ada origin sama sekali** (termasuk halaman itu sendiri) yang diizinkan pakai API tersebut — ini langsung berhadapan dengan `LocationTagger.tsx` (`navigator.geolocation.getCurrentPosition`) dan `Scanner` barcode (`getUserMedia` kamera) yang baru saja Anda bangun dan (dari cerita Anda) sudah live. **Ini kemungkinan besar penyebab kalau ada laporan teknisi "GPS tidak bisa diambil" atau "kamera tidak muncul" yang selama ini dikira masalah device/browser mereka**, padahal sebenarnya diblokir dari sisi server.

**Perbaikan:**
```js
response.headers.set(
  'Permissions-Policy',
  'camera=(self), microphone=(), geolocation=(self), interest-cohort=()',
);
```
`(self)` mengizinkan origin aplikasi sendiri memakainya (browser tetap akan minta izin device ke user seperti biasa — ini hanya server-level allow/deny, bukan pengganti izin OS/browser), sementara tetap memblokir origin pihak ketiga manapun yang di-embed. **Saya sarankan ini jadi hal pertama yang diperbaiki dari seluruh PRD ini** — dampaknya langsung ke fitur inti yang baru dibangun.

### 3.2 Credential Plaintext di `ecosystem.config.js`

`QOSMIC_BRIDGE_TOKEN` di-hardcode plaintext, terduplikasi di 4 app config berbeda dalam file yang sama. Kalau file ini ter-commit ke git (kemungkinan besar, karena ini file konfigurasi PM2 yang biasa disimpan di repo), token QOSMIC **ada di riwayat git selamanya** meski nanti dipindah — rotasi token jadi wajib begitu dipindah ke tempat aman.

**Rekomendasi bertingkat:**
1. **Segera:** pindahkan ke `.env` file terpisah per environment (tidak di-commit, sudah ada `dotenv` sebagai dependency), `ecosystem.config.js` cukup `process.env.QOSMIC_BRIDGE_TOKEN` tanpa nilai literal.
2. **Rotasi token QOSMIC** setelah dipindah (asumsikan token lama sudah "bocor" secara riwayat git, meski akses ke repo Anda mungkin terbatas — prinsip aman: token yang pernah plaintext di file harus dianggap tercompromise).
3. **Jangka menengah:** pertimbangkan secret manager (aaPanel punya fitur env var terenkripsi, atau minimal `.env` dengan permission file `600` khusus user aplikasi) — di luar scope PRD ini untuk dirancang detail, saya tandai sebagai rekomendasi arah, bukan implementasi lengkap.

### 3.3 Technical Debt — Route Shell Triple-Duplication

`admin/helpdesk/superadmin/rekap-workorder/page.tsx` (dan kemungkinan pola serupa di halaman lain seperti `import-tiket` yang saya lihat sebelumnya hanya di `admin/tools`) — client component-nya sudah benar shared, tapi **page shell (role-guard wrapper) terduplikasi manual**. Risiko: kalau logic role-guard perlu berubah (mis. tambah role baru), harus diingat untuk update di 3 tempat — rawan lupa satu, menciptakan celah akses tidak konsisten.

**Rekomendasi:** ekstrak pola shell jadi satu helper `withRoleGuard(Component, allowedRoles, fallbackRedirect)` (Higher-Order Component atau shared layout function) dipakai oleh ketiga `page.tsx` — mengurangi baris duplikat dari ~100 baris jadi masing-masing cuma manggil helper dengan parameter role berbeda. Ini juga relevan untuk pola `Tools` (§6.2 PRD sebelumnya, `import-tiket`) yang berpotensi mengulang pola sama saat fitur baru ditambah.

### 3.4 Rate Limiting — Sudah Baik, Perlu Audit Cakupan

Pola `enforceApiRateLimit` per-namespace sudah konsisten dipakai di endpoint war-map/KML yang saya audit sebelumnya. **Rekomendasi:** audit apakah **semua** endpoint mutasi sensitif (login, close ticket, update alamat/lokasi, upload evidence) sudah punya rate limit — endpoint login khususnya rawan brute-force kalau belum. Saya tidak sempat verifikasi satu-satu di audit ini (di luar scope file yang saya terima), tapi ini action item konkret: grep `enforceApiRateLimit` di seluruh `app/api` dan silang-cek dengan daftar endpoint sensitif.

### 3.5 Content-Security-Policy — Perkuat Bertahap

`script-src` masih pakai `'unsafe-inline'` di production (lazim untuk Next.js tanpa setup nonce, tapi melemahkan proteksi XSS). **Rekomendasi jangka menengah** (bukan urgent): migrasi ke CSP nonce-based (Next.js App Router mendukung ini via middleware generate nonce per-request) — pekerjaan non-trivial, cocok jadi item roadmap terpisah, bukan quick-fix.

Tambahan kecil yang aman & cepat: tambahkan `object-src 'none'` dan `upgrade-insecure-requests` ke CSP existing — dua baris tambahan, tidak breaking apa pun, memperkuat baseline.

### 3.6 Performa — Observasi dari Konfigurasi yang Sudah Ada

Konfigurasi `PRISMA_CONNECTION_LIMIT`/`PRISMA_POOL_TIMEOUT` per proses di `ecosystem.config.js` **sudah cukup matang** (beda limit per jenis worker, sudah hasil tuning dari histori kerja Anda soal P1017/1205 lock timeout). Tidak ada rekomendasi baru di sisi ini — hanya **pastikan config baru (KML import, branch filter) tidak menambah beban query N+1** — khususnya endpoint `war-map/kml-layers` yang saya rancang sebelumnya sudah pakai cache Redis 5 menit, ini pola yang tepat, teruskan pola sama untuk endpoint branch/durasi baru (§2).

---

## 4. Halaman Overview — Lebih Informatif & Enak Dilihat

### 4.1 Kondisi Saat Ini

`TicketManagementOverviewPage.tsx` (964 baris) — murni **snapshot angka hari ini** (Total, Open, Assigned, Close; Flagging Summary MANJA HI/MANJA H+/FFG/GAMAS; Customer Type breakdown). Tidak ada elemen yang menjawab pertanyaan alami seorang admin: *"apakah ini lebih baik atau lebih buruk dari kemarin?"*, *"tiket mana yang butuh perhatian SEKARANG (bukan cuma jumlahnya)?"*

### 4.2 Rekomendasi Konkret

1. **Indikator tren di setiap angka utama** — bukan cuma "Total 2.228", tambahkan delta kecil di bawahnya: `▲ 4% vs kemarin` / `▼ 2% vs kemarin` (hijau/merah). Data historis sudah tersedia lewat `DashboardSummarySnapshot` (tabel yang sudah ada di schema, dipakai `snapshot-worker`) — tidak perlu tabel baru, cukup query pembanding H-1.
2. **"Butuh Perhatian Sekarang"** — kartu terpisah paling atas (di atas Flagging Summary), berisi maksimal 5 tiket paling kritis (kombinasi: SLA breach terdekat + flag MANJA HI + belum ada teknisi assigned lebih dari X jam) — actionable langsung (klik → buka detail ticket), bukan cuma angka agregat.
3. **Auto-refresh real-time** — halaman ini fokus operasional harian yang idealnya reaktif seperti halaman Durasi yang sudah "Auto-refresh every minute" (screenshot 2). Reuse `sseBroadcast` yang sudah ada di infrastruktur (dipakai war map & invalidate cache tiket) untuk push update Overview tanpa perlu klik refresh manual.
4. **Ringkas prioritas visual** — 4 kartu Flagging Summary (MANJA HI/H+/FFG/GAMAS) saat ini sejajar tanpa hierarki visual. Beri warna latar lebih tegas untuk yang jumlahnya di atas ambang batas normal (mis. kalau MANJA HI > threshold historis rata-rata, kartunya highlight merah muda, bukan cuma angka merah kecil) — supaya sekali lihat langsung tahu mana yang butuh eskalasi.
5. **Shortcut aksi cepat** — tombol kecil di tiap kartu bucket (Customer, Proactive, Unspec, dst) langsung ke workboard terfilter bucket itu — kemungkinan sudah ada (perlu saya cek workboard existing di bagian bawah halaman), kalau belum, ini quick win murah.
6. **Perbandingan antar-workzone/branch** (setelah filter branch §2 selesai dibangun) — mini bar chart "Top 3 branch dengan beban tertinggi hari ini" di Overview, memanfaatkan data yang sama seperti Dashboard Durasi ("WORST AREA" di screenshot 2) tapi di level ringkasan paling depan yang paling sering dilihat.

---

## 5. Fitur Lanjutan — Menuju Sistem yang Lebih Canggih

Beberapa dari daftar ini melanjutkan §12/§13 dari dua PRD War Map sebelumnya (`PRD-War-Map-Geo-Tagging-Gangguan.md`, `PRD-War-Map-KML-Import-Layer.md`) — saya tidak mengulang yang sudah tertulis di sana (termasuk sistem alert ODP dari kepadatan gangguan, yang sudah ada dokumen terpisah `PRD-War-Map-KML-Rendering-Fidelity-ODP-Alert.md` di folder `plans/` Anda). Berikut ide baru di luar cakupan War Map:

### 5.1 Notifikasi WhatsApp/Telegram untuk Eskalasi Kritis
Ticket dengan flag MANJA HI yang belum ter-assign > N menit, atau SLA breach mendekat, kirim notifikasi otomatis ke grup WhatsApp/Telegram NOC (Anda sudah tampak familiar dengan Telegram, terlihat dari nama file screenshot). Infrastruktur outbound sudah ada polanya (`tech_event_outbox`, webhook pattern) — tinggal tambah channel baru.

### 5.2 Prediksi Beban Kerja Teknisi (Load Balancing)
Sebelum admin assign ticket manual ke teknisi, tampilkan estimasi beban kerja tiap teknisi saat ini (jumlah ticket aktif + rata-rata waktu penyelesaian historis mereka) — supaya assignment lebih merata, bukan berdasarkan siapa yang kebetulan dilihat admin duluan.

### 5.3 Portal Status Mandiri untuk Pelanggan (Self-Service)
Halaman publik sederhana (tanpa login) di mana pelanggan bisa cek status gangguan mereka pakai nomor tiket/service_no — mengurangi volume panggilan helpdesk untuk pertanyaan status yang berulang ("kapan selesai?"). Perlu rate-limit ketat & tanpa expose data sensitif pelanggan lain (hanya status ringkas, bukan detail teknis).

### 5.4 Ringkasan RCA Otomatis (AI-Assisted, Opsional)
Setelah cukup banyak data RCA + description_solution_dompis terkumpul, model bisa membantu **menyarankan** RCA yang paling mungkin berdasarkan pola gejala yang mirip di tiket-tiket lampau dengan `device_name`/ODP yang sama — mempercepat pengisian RCA teknisi (saran, bukan otomatis mengisi tanpa konfirmasi manusia).

### 5.5 Audit Trail Terpusat untuk Compliance
Dengan makin banyak fitur sensitif (data pelanggan di war map, token QOSMIC, dst — §3.2), pertimbangkan dashboard audit log terpusat (siapa akses data pelanggan apa, kapan) untuk kebutuhan compliance internal Telkom Akses — bisa dibangun di atas pola `ticket_activity_log` yang sudah ada, diperluas cakupannya ke luar ticket (mis. akses War Map, export data).

---

## 6. Rencana Eksekusi (Prioritas Usulan)

| Prioritas | Item | Alasan |
|---|---|---|
| 🔴 **Segera** | §3.1 — Perbaiki `Permissions-Policy` | Kemungkinan langsung memperbaiki bug geotagging/scanner yang sudah live tapi silently broken |
| 🔴 **Segera** | §3.2 — Pindahkan token QOSMIC ke `.env` + rotasi | Risiko keamanan aktif, murah untuk diperbaiki |
| 🟡 Tinggi | §2 — Filter Branch (header, durasi, rekap workorder) | Diminta eksplisit, scope jelas, endpoint baru kecil |
| 🟡 Tinggi | §1.2 — Alur gabungan Alamat+Lokasi | Dampak langsung ke pengalaman harian teknisi lapangan |
| 🟢 Menengah | §4 — Overview redesign | Peningkatan kualitas, tidak mendesak |
| 🟢 Menengah | §3.3 — Konsolidasi route shell | Technical debt, tidak urgent tapi makin numpuk kalau ditunda |
| 🔵 Lanjutan | §5 — Fitur baru | Roadmap jangka menengah-panjang |

Saya siap susun prompt eksekusi untuk item mana pun di atas untuk OpenCode/Codex CLI — beri tahu saya mau mulai dari yang mana, atau kalau mau saya urutkan ulang berdasar prioritas operasional Anda sendiri.
