# PRD — Fitur Lanjutan: Load Balancing (5.2), Self-Service Portal (5.3), RCA AI-Assisted (5.4), Audit Trail Terpusat (5.5)

> **Status:** Draft — untuk review & prioritas.
> **Lingkup:** §5.2, §5.3, §5.4, §5.5 dari `PRD-UX-Teknisi-Filter-Branch-Security-Overview.md`.
> **§5.1 (Notifikasi WhatsApp/Telegram) sengaja dilewati** sesuai permintaan pemilik produk.
> **§5.3 (Portal Status Mandiri) — DITANDA TUNDA EKSEKUSI.** Desain & infrastruktur didokumentasikan penuh di sini, tapi JANGAN dieksekusi sekarang. Menunggu keputusan lebih lanjut (persetujuan keamanan, kepemilikan channel SMS/WA NOC, dsb).

---

## 0. Ringkasan Eksekutif

| Fitur | Dampak Operasional | Kompleksitas | Status Eksekusi |
|---|---|---|---|
| §5.2 Prediksi Beban Teknisi (Load Balancing) | Tinggi — assignment lebih merata, mengurangi burnout & SLA breach | Sedang | Siap eksekusi berikutnya |
| §5.3 Portal Status Mandiri Pelanggan | Menengah — kurangi panggilan helpdesk berulang | Tinggi (keamanan) | **TUNDA** |
| §5.4 RCA AI-Assisted | Menengah — percepat pengisian RCA teknisi | Rendah–Sedang | Siap eksekusi (threshold ≥50 tiket) |
| §5.5 Audit Trail Terpusat | Tinggi — compliance Telkom Akses | Sedang | Siap eksekusi |

Prioritas usulan eksekusi: **5.2 → 5.5 → 5.4** (5.3 menyusul setelah keputusan pemilik produk).

---

## 1. §5.2 Prediksi Beban Kerja Teknisi (Load Balancing)

### 1.1 Masalah Saat Ini

Admin melakukan assign manual via `POST /api/tickets/assign` (`app/api/tickets/assign/route.ts`) ke teknisi yang dipilih dari dropdown `AssignTechnicianModal`. Tidak ada informasi beban kerja masing-masing teknisi: berapa tiket aktif, apakah teknisi itu sedang overload, berapa rata-rata waktu penyelesaian historis mereka. Akibatnya:

- Assign sering jatuh ke teknisi yang tampak "kosong" padahal tidak tersedia.
- Tidak ada dasar objektif untuk melakukan pemerataan beban.
- Teknisi tertentu bisa menumpuk tiket sementara yang lain idle.

### 1.2 Tujuan

Sebelum admin assign, tampilkan estimasi beban tiap teknisi secara real-time: jumlah tiket aktif (assigned + on_progress + pending) dan rata-rata TTR (waktu penyelesaian) historis. Beri rekomendasi teknisi yang paling tidak terbebani sebagai saran default.

### 1.3 Fondasi Data Existing (sudah diverifikasi)

- `ticket_tracking` (`prisma/schema.prisma:728`) — `assigned_at`, `picked_up_at`, `on_progress_at`, `pending_at`, `closed_at`, `is_active` → sumber TTR & workload aktif.
- `ticket_assignment_history` (schema:367) — riwayat assign/unassign; `assigned_at`, `unassigned_at`, `is_active`.
- `ticket_status_history` (schema:696) — timeline status change.
- `technicians/performance` endpoint (`app/api/technicians/performance/route.ts:225-239`) — **sudah ada SQL**: `AVG(TIMESTAMPDIFF(SECOND, tt.assigned_at, tt.closed_at))/3600 as avg_hours` per teknisi. Bisa di-reuse langsung.
- `technicians/[id]` (`app/api/technicians/[id]/route.ts:178`) — sudah menghitung `assigned_tickets`, `total_assigned`, breakdown status. Menunjukkan cara query tiket aktif per teknisi.
- `GET /api/technicians` (`app/api/technicians/route.ts`) — daftar teknisi + `summary: { total_active, total_assigned, overload_count, idle_count }` (L186/214). Sudah ada konsep "overload" & "idle".

### 1.4 Spesifikasi Fungsional

**Endpoint baru:** `GET /api/technicians/workload`

```
GET /api/technicians/workload?workzone=BANDUNG&branchId=3
  Role: admin, helpdesk, superadmin (non-strict → mencakup senior_leader/admin_branch)
  Return: {
    generatedAt: string,
    summary: { total_teknisi, available, overloaded, on_leave },
    technicians: [{
      id_user, nama, nik, workzone,
      active_tickets: number,          // assigned + on_progress + pending
      assigned_count: number,
      on_progress_count: number,
      pending_count: number,
      avg_ttr_hours: number | null,     // TTR dari assigned_at → closed_at, 30 hari kebelakang
      overloaded: boolean,              // active_tickets > threshold per-area
      load_score: number,               // skor komposit 0-100 (lihat formula)
      recommended: boolean              // kandidat rekomendasi assign
    }]
  }
```

**Formula load_score (usulan v1, sederhana):**

```
load_score = clamp01( active_tickets / maxActivePerTech ) * 60
           + clamp01( avg_ttr_hours / targetTtrHours ) * 25
           + clamp01( pending_count / maxPendingPerTech ) * 15
```

- `maxActivePerTech`, `targetTtrHours`, `maxPendingPerTech` dari konstanta default (mis. 5 / 8 / 3) dengan kolom override opsional di `manhours_config` (sudah ada tabel) via key `load:*`.
- `recommended = load_score` terendah di antara teknisi yang sama workzone & available (tidak overload & tidak on_leave).
- Overload threshold: `active_tickets >= maxActivePerTech`.

**Integrasi UI:** di `AssignTechnicianModal` — tambah kolom status beban per teknisi (indikator warna + badge `overload`), dan tandai kandidat rekomendasi dengan badge "Saran". Data diambil paralel saat modal dibuka; cache 30s (reuse pola `getOrSetCache` seperti performance route L30).

### 1.5 API Contract Detail

- Server-side filtering oleh role → reuse `getWorkzonesForUser` + `resolveBranchScope` (`app/helpers/ticket.helpers.ts`).
- Tidak memerlukan tabel baru; semua aggregate dari tabel existing.
- Cache: `private, max-age=30, stale-while-revalidate=60` (pola middleware `/api/dashboard/` L110-112; `technicians` L114-115).

### 1.6 Keamanan & Rate Limit

- `protectApi(['admin','helpdesk','superadmin'])`.
- `enforceApiRateLimit` namespace `techs-workload`, limit 60/min (data berat, admin-only).
- Tidak expose data pelanggan — hanya data agregat teknisi.

### 1.7 Risiko

- Data TTR bisa skewed oleh tiket pending lama → gunakan window 30 hari + filter `status_update != 'PENDING'` saat hitung avg TTR (atau tampilkan sebagai metrik terpisah).
- Workload real-time butuh freshness → cukup 30 detik; tidak perlu SSE push di v1.

### 1.8 Acceptance Criteria

1. Admin buka Assign modal → melihat jumlah tiket aktif, avg TTR, dan skor per teknisi.
2. Teknisi yang overload diflag "overload" secara visual (merah).
3. Teknisi dengan load_score terendah ditandai "Saran".
4. Response < 800ms untuk area dengan ≤ 100 teknisi.

---

## 2. §5.3 Portal Status Mandiri untuk Pelanggan (Self-Service)

> **⚠️ DITANDA TUNDA EKSEKUSI.** Dokumentasi lengkap untuk desain & infrastruktur. Jangan implementasi tanpa persetujuan lanjut.

### 2.1 Masalah

Pelanggan sering menelpon helpdesk hanya untuk bertanya status gangguan ("kapan selesai?"). Volume call berulang membebani helpdesk. Perlu saluran self-service yang aman tanpa membuka data pelanggan lain.

### 2.2 Keputusan Desain (dikonfirmasi pemilik produk)

**Mekanisme akses: Token rahasia via SMS/WA (sekali pakai).** Bukan sekadar "nomor tiket + nomor HP" yang bisa di-enumerate. Alur:

1. Pelanggan input `service_no` (+ opsional nomor HP tujuan) di halaman publik.
2. Sistem verifikasi `service_no` ada di `ticket.service_no` (index `idx_ticket_search_service_no`, schema:335).
3. Sistem generate token 6 digit acak, one-time, TTL 10 menit, simpan ke tabel baru `self_service_token`.
4. Token dikirim ke nomor HP terdaftar pada tiket (`contact_phone`) — belum ada channel SMS terpasang, ini bagian yang **dibahas lebih lanjut** (integrasi n8n/HTTP endpoint).
5. Pelanggan masukkan token → sistem verifikasi → tampilkan status ringkas pemilik tiket tersebut.

### 2.3 Data Model (baru — JANGAN di-lakukan sekarang)

```prisma
model self_service_token {
  id         BigInt    @id @default(autoincrement())
  service_no String    @db.VarChar(100)
  token_hash String    @db.VarChar(200)          // hash SHA-256 token, bukan plaintext
  expires_at DateTime  @db.Timestamp(0)
  used_at    DateTime? @db.Timestamp(0)
  created_at DateTime  @default(now()) @db.Timestamp(0)

  @@index([service_no, expires_at])
  @@index([token_hash, expires_at])
  @@map("self_service_token")
}
```

### 2.4 API Contract (dokumentasi desain)

```
POST /api/public/ticket-status/request     → { serviceNo } → { status: 'sent' }
POST /api/public/ticket-status/verify      → { serviceNo, token } → { found, data? }
POST /api/public/ticket-status/request     rate-limit: 5 req/jam per IP + per service_no
POST /api/public/ticket-status/verify      rate-limit: 10 req/15 menit per IP
```

Payload status ringkas (NON-teknis) pada `verify` sukses:
```
{
  serviceNo,
  status,                  // OPEN / ASSIGNED / ON PROGRESS / PENDING / CLOSE
  summary,                 // ringkasan gangguan (non-teknis)
  estimatedNote,           // catatan estimasi (dari jam_expired / manja_expired, di-rounding)
  updatedAt,
  nearSlaBreach: boolean
}
```

### 2.5 Keamanan & Kontrol Kritis

- **Rate limit ketat per-IP & per-service_no** (lihat §2.4) — mencegah enumerasi.
- **Token disimpan ter-hash** (SHA-256 + salt), bukan plaintext; compare via constant-time.
- **JANGAN pernah**: mengembalikan data pelanggan lain, data teknis (alat/ODP/alamat detail), alamat penuh, nomor HP, nama pelanggan penuh. Hanya status ringkas.
- Halaman publik tanpa auth → tidak boleh leak data via error message (gunakan pesan generik).
- Middleware tidak melewatkan `/api/public/*` ke cache default `no-cache`; tambahkan CORS restriktif (HANYA origin sendiri).

### 2.6 Infrastruktur Outbound SMS/WA (yang perlu dibahas)

- Pola existing: `tech_event_outbox` (`createTechEvent.ts`) untuk event ke tech-events, dan `reguler_webhook_outbox` untuk webhook reguler. Keduanya OUTBOX + worker dispatch.
- Untuk SMS: buat outbox serupa (`message_outbox`) + worker yang memanggil provider (n8n HTTP / API gateway). **Kepemilikan & biaya channel adalah keputusan pemilik produk.**

### 2.7 Risiko & Open Questions

1. Siapa pemilik channel SMS/WA (n8n gateway? provider apa? estimasi biaya volume)? — **KEPUTUSAN PRODUK, blocker.**
2. Apakah n8n bisa memanggil API publik ini untuk kirim SMS? Atau server perlu call n8n?
3. Kebijakan retensi token & log akses (berkait §5.5).

---

## 3. §5.4 Ringkasan RCA Otomatis (AI-Assisted)

### 3.1 Masalah

Teknisi mengisi `rca`, `sub_rca`, `description_solution_dompis` di tiket saat close. Pengisian manual lambat; kualitas bergantung pengalaman. Banyak ticket closed dengan `device_name`/ODP yang sama memiliki solusi yang mirip — polanya tidak dieksploitasi.

### 3.2 Tujuan

Saat teknisi membuka form RCA, sistem menampilkan **saran RCA** yang paling mungkin berdasarkan pola historis: tiket closed dengan RCA sama pada `device_name` (ODP/ONT) yang sama + gejala (`symptom`) yang mirip. **Saran saja — wajib konfirmasi manusia, bukan auto-fill final.**

### 3.3 Desain (berbasis data existing, TANPA ML model berat)

**Pendekatan: co-occurrence lookup, bukan model AI.** Alasan: data RCA terbatas; co-occurrence cukup untuk v1 dan jauh lebih mudah dijelaskan/audited.

Endpoint baru: `GET /api/tickets/rca-suggestion?deviceName=...&symptom=...`

```
  Role: teknisi, admin, helpdesk, superadmin
  Return: {
    deviceName,
    symptom,
    suggestions: [{ rca, subRca, description_solution_dompis, count, matchRate }],
    totalClosedAnalysed
  }
```

**Logika:**

1. Ambil tiket **closed** yang punya `rca` + `device_name` sama persis, 180 hari kebelakang.
2. Cocokkan `symptom` ringkas (normalisasi huruf kecil, strip punctuation; boleh fuzzy kata kunci di v1).
3. Kelompokkan per `(rca, sub_rca)` — hitung `count` dan `matchRate = count / total` dalam kelompok device_name.
4. Tampilkan top 3 saran dengan `matchRate` tertinggi; tandai yang `matchRate ≥ 0.5` sebagai "kemungkinan besar".

**Threshold aktivasi (dikonfirmasi pemilik produk):** fitur hanya menghasilkan saran jika **≥ 50 tiket closed dengan RCA** untuk kombinasi `device_name` + gejala yang sama. Di bawah itu → return `{ suggestions: [], reason: 'insufficient_data' }`.

### 3.4 Data Model

Tidak ada tabel baru. Indeks pendukung (opsional, untuk performa query 180 hari ke belakang):

```sql
CREATE INDEX idx_ticket_rca_lookup
  ON ticket (device_name, rca, sub_rca, closed_at);
```

> Catatan: `device_name`, `rca`, `sub_rca`, `closed_at` sudah merupakan kolom `ticket` (schema:270, 309-310, 315).

### 3.5 Integrasi UI

- Di form close/pickup teknisi (`TicketWorkflowService.closeTicket` / komponen teknisi) — saat RCA field difokuskan dan `device_name` tidak kosong, panggil endpoint saran, render chip pilihan. Klik chip → isi field (bukan auto-submit).
- Cache hasil 1 jam per `device_name` (data historis jarang berubah).

### 3.6 Keamanan & Rate Limit

- `protectApi(['admin','helpdesk','superadmin','teknisi'])` atau role check per kebijakan.
- Rate limit 60/min per user. Batasi ukuran respons (top 3).

### 3.7 Risiko

- False positives jika gejala terlalu umum → selalu tampilkan `matchRate` & konfirmasi manual.
- RCA lama bisa "salah" — jadikan saran, jangan auto-commit (ditegaskan ulang).
- Volume data di bawah threshold → fitur tidak muncul (guard oleh `insufficient_data`).

### 3.8 Acceptance Criteria

1. Teknisi fokus field RCA pada tiket dgn `device_name` tertentu → mendapat ≤3 saran + matchRate.
2. Kombinasi dgn <50 tiket closed → respons `insufficient_data`, UI menampilkan pesan "data belum cukup".
3. Mengisi RCA dari saran TIDAK melewati konfirmasi manual (klik chip dulu).
4. Query saran berjalan < 300ms (via indeks + cache).

---

## 4. §5.5 Audit Trail Terpusat untuk Compliance

### 4.1 Masalah

`ticket_activity_log` (schema:352) sudah ada tapi cakupannya **hanya operasi tiket** (activity_type enum ticket, user_id, role_id, ticket_id). Fitur yang makin banyak menyentuh data sensitif (akses War Map → ODP/pelanggan, export data, akses QOSMIC) tidak tercatat terpusat. Compliance internal Telkom Akses membutuhkan: *siapa mengakses data pelanggan apa, kapan.*

### 4.2 Tujuan

Dashboard audit log terpusat yang mencatat akses & aksi sensitif di LUAR konteks tiket (war map, export, dll), plus ekspor untuk audit.

### 4.3 Data Model (baru — additive, aman untuk migration)

```prisma
model audit_log {
  id            BigInt    @id @default(autoincrement())
  actor_id      Int?
  actor_role    String    @db.VarChar(50)
  action        String    @db.VarChar(100)     // WAR_MAP_VIEW, EXPORT, CUSTOMER_DATA_VIEW, etc.
  resource_type String    @db.VarChar(50)      // ticket, war_map, export, qosmic
  resource_id   String?   @db.VarChar(100)
  meta          Json?
  ip_address    String?   @db.VarChar(45)
  user_agent    String?   @db.VarChar(255)
  created_at    DateTime  @default(now()) @db.Timestamp(0)

  @@index([actor_id, created_at])
  @@index([action, created_at])
  @@index([resource_type, resource_id])
  @@index([created_at])
  @@map("audit_log")
}
```

### 4.4 Titik Instrumentasi (usulan)

| Aksi | Lokasi injeksi |
|---|---|
| Akses War Map (lihat layer/ODP/pelanggan) | route war-map yang return data pelanggan |
| Export data harian/tiket | `app/api/tickets/export/route.ts`, `daily/export`, `detail-wo-hi/export`, `technicians/*/export` |
| Akses detail pelanggan sensitif | `getTicketDetailForActor` (`app/libs/services/ticketDetail.service.ts:47`) |
| Search Nossa / akses QOSMIC | `app/api/nossa/search/route.ts` |
| Perform user/password/role CRUD | `users.service.ts` (sudah punya `ticket_activity_log`? — perlu titik baru) |

**Pendekatan implementasi:** helper `writeAuditLog(actor, action, resourceType, resourceId?, meta?, req?)` (ip + user-agent dari request) dipanggil di titik-titik di atas. **Non-blocking fire-and-forget** (bukan await di hot path — pakai queue/`setImmediate` atau outbox) supaya tidak menambah latensi API.

### 4.5 UI Dashboard

- Route: `/admin/audit-log` (superadmin) → filter: rentang waktu, role, action, resource_type, actor.
- Tampilan: tabel (waktu, actor, role, action, resource, meta ringkas) + filter + tombol export CSV.
- Reuse pola halaman admin existing + `protectApi(['superadmin'], { strict: true })`.

### 4.6 Kebijakan Retensi

- Default retain 400 hari (TIDAK menghapus tiket yang lagi open/diproses). Purge worker terpisah menghapus `audit_log` > 400 hari secara batch (pola worker existing).
- Volume estimasi: ~5k–50k baris/hari tergantung instrumen → indeks `created_at` penting; partisi bulanan optional bila > 1jt row.

### 4.7 Risiko

- Jangan log data payload penuh pelanggan (meta harus redacted — hanya id/referensi).
- Fire-and-forget bisa hilang saat deploy → optional: outbox + retry seperti `tech_event_outbox`.
- Performa: hot path (detail tiket) jangan synchronous-blocking.

### 4.8 Acceptance Criteria

1. Aksi war map view & export tercatat otomatis dengan actor, timestamp, resource.
2. Dashboard superadmin bisa filter & export audit log.
3. Meta tidak mengandung PII mentah (hanya id/referensi).
4. Retensi auto-purge > 400 hari tanpa downtime.

---

## 5. Dependensi & Peta Kode

| Komponen | Lokasi |
|---|---|
| Branch scope / workzone scope (dipakai 5.2 filter) | `app/helpers/ticket.helpers.ts` (`getWorkzonesForUser`, `resolveBranchScope`, `getBranchesForUser`) |
| Cache server | `lib/cache.ts` (`getOrSetCache`) |
| Rate limit | `lib/ratelimit.ts`, `lib/api-rate-limit.ts` |
| Auth API | `app/libs/protectApi.ts` |
| SSE broadcast (realtime cache invalidate) | `app/libs/sseBroadcast.ts` |
| Outbox pattern (5.3 SMS, 5.5 audit fallback) | `app/libs/createTechEvent.ts` (`tech_event_outbox`) |
| TTR existing (5.2) | `app/api/technicians/performance/route.ts:225` |
| Workload existing (5.2) | `app/api/technicians/route.ts:186` |
| Assign flow (5.2 UI integration) | `app/api/tickets/assign/route.ts`, `AssignTechnicianModal` |
| RCA fields (5.4) | `ticket.rca`, `ticket.sub_rca`, `ticket.description_solution_dompis`, `ticket.device_name`, `ticket.symptom` |
| Activity log basic (5.5) | `prisma/schema.prisma:352` (`ticket_activity_log`) |

---

## 6. Rencana Eksekusi (Prioritas)

| Urutan | Item | Fase |
|---|---|---|
| 1 | **5.2 Load Balancing** — endpoint `GET /api/technicians/workload` + integrasi `AssignTechnicianModal` | Eksekusi terdekat |
| 2 | **5.5 Audit Trail** — schema `audit_log` + `writeAuditLog` + dashboard `/admin/audit-log` | Eksekusi |
| 3 | **5.4 RCA Suggestion** — endpoint `GET /api/tickets/rca-suggestion` + integrasi form close | Eksekusi (threshold ≥50) |
| 4 | **5.3 Self-Service Portal** — **TUNDA** sampai keputusan channel SMS/WA & persetujuan keamanan | Menunggu |

### Catatan Kunci

- Semua fitur di atas **additive** — tidak merusak alur existing.
- 5.2, 5.5, 5.4 bisa dikerjakan independen. 5.3 menyusul.
- Sesuaikan role/policy via `protectApi` & pattern scoping existing — jangan buat pola baru tanpa alasan.