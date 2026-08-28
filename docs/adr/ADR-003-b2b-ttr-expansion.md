# ADR-003: Perluasan Max TTR ke 35 Jenis Tiket (B2B Fokus)

- **Tanggal:** 2026-08-28
- **Status:** Accepted
- **Konteks:** `docs/adr` baru — ADR-001/002 belum ada, penomoran mulai dari 003 untuk TTR.
- **Pelaku:** dev + superadmin
- **Frekuensi perubahan TTR:** sangat jarang (tahunan)

## Konteks

Sebelumnya hanya 5 key di `app/config/jenis-tiket.ts` punya `slaOverrideHours` (`sqm-ccan 4`, `indibiz 4`, `datin 1.5`, `reseller 6`, `wifi-id 24`). 20+ key B2B lain `null → exclude` dari `ttr_comply` (KPI tidak dinilai) dan fallback display ke `getSlaHours(customerType)=24` yang tidak eksplisit. Kebutuhan baru: setiap `jenis_tiket_2` punya Max TTR definitif, terutama B2B, sesuai tabel 35 baris dari stakeholder.

## Keputusan

### 1. Tetap Code Config (Opsi A) — bukan DB-driven

- **Alasan:** Perubahan tahunan oleh dev/superadmin, butuh review PR + `git log` sebagai audit sudah cukup. DB `ttr_override` + Admin UI menambah migrasi, cache, dan risiko salah isi tanpa `tsc` guard untuk kasus yang jarang.
- **Konsekuensi:** Ganti TTR = edit `app/config/jenis-tiket.ts` 1 angka → PR → `npm run build` → deploy. Tidak perlu table baru.

### 2. Single Source Jam: `app/config/jenis-tiket.ts:JENIS_TIKET_LIST[].slaOverrideHours`

- Sebelum 5 key, sesudah **33 key** (tambah `sip-trunk`, `ip-transit`). Contoh perubahan breaking: `indibiz 4→24`, `reseller 6→24`.
- 10 key netral tetap punya `slaOverrideHours=24` untuk **display** tapi `comply null` (exclude KPI): `unknown`, `digital-spbu`, `non-numbering`, `billing`, `infracare`, `gamas`, `gamas-feeder`, `gamas-gpon`, `gamas-distribusi`, `gamas-odp`.

### 3. Rule Kondisional Tetap di `app/libs/tickets/ttr-comply.ts`

Tidak bisa diwakilkan oleh angka flat di `jenis-tiket.ts`:

- **K-tier family** `DATIN/ASTINET/VPN IP/METRO-E/IP_TRANSIT`: suffix ` K1=1.5 / K2=3.6 / K3=7.2` di `jenis_tiket_2` (dari `ticket_raw_bridge_ext.c_description_serviceid`). `SIP TRUNK` flat `10` (di-exclude dari K-tier).
- **TOP OLO**: `ticket_id_gamas` ada →7j, kosong →4j (via `ticket.ticket_id_gamas`).
- **SQM-CCAN 4j workhour**: hanya `08:00-17:00 WIB`; `non_work_hour → null` (exclude, sama pola `SQM`).
- **Permintaan**: `customer_segment DCS/PL-TSEL → HVC tier 3/6/12/24` via `customer_type`, else `24`.
- **TSEL varian**: `critical 4 / major 8 / minor 16 / low 24 / premium-site 2` via `slaOverrideHours`.

### 4. Display `app/libs/tickets/effective.ts` Sinkron dengan Compliance

Fallback baru: `booking+3h` → `guarantee P1/P+ +3h` → `DB maxTtr*` → `getComplyMaxTtrHours()` (K-tier/TOP OLO/HVC) → `static getJenisSlaHours()` (netral display) → `getSlaHours()` Reguler 24. Jadi `MaxTtrCell` konsisten dengan `ticket.ttr_deadline_at`.

### 5. Wiring `lib/projection/index.ts`

`buildProjectionUpsert` pass `ticketIdGamas` ke `computeTtrCompliance`. `single.ts` sudah include `ticket_id_gamas`.

## Tabel Final (Jam Baru)

| key | jam | key | jam | key | jam |
|-----|-----|-----|-----|-----|-----|
| reguler | HVC tier | non-datin | 24 | tsel-minor | 16 |
| hvc | HVC tier | wifi-id | 24 | tsel-low | 24 |
| sqm | HVC tier + WH4 | infracare | 24 netral | tsel-premium-site | 2 |
| unspec | 24 | unknown | 24 netral | vpn-ip | K-tier 1.5 |
| sqm-ccan | 4 WH | digital-spbu | 24 netral | metro-e | K-tier 1.5 |
| indibiz | 24 | permintaan | 24 / HVC | dwdm | 7.2 |
| datin | K-tier | unspec-b2b | 24 | gamas | 4 netral |
| reseller | 24 | non-numbering | 24 netral | gamas-feeder | 10 netral |
| | | billing | 24 netral | gamas-gpon | 1 netral |
| | | astinet | K-tier | gamas-distribusi | 4 netral |
| | | tsel | 24 | gamas-odp | 3 netral |
| | | top-olo | 4/7 cond | sip-trunk | 10 |
| | | tsel-critical | 4 | ip-transit | K-tier 1.5 |
| | | tsel-major | 8 | | |

## Dampak & Migrasi

- **Breaking KPI:** `indibiz`/`reseller` naik, banyak `not_comply → comply`. Tidak perlu migrasi schema; cukup `npx tsx scripts/backfill-ttr-comply.ts` untuk closed tickets historis (scoped, mirip backfill `48af93c` 427k scan).
- **Netral:** `gamas` varian masuk netral (instruksi stakeholder) → `ttr_comply_status` tetap `null`.
- **Verifikasi:** `npm run build` + `npx tsx` 35 assert (K-tier, TOP OLO, WH, netral) lolos.

## Alternatif Dipertimbangkan

- **Opsi B DB-driven `ttr_config` + Admin UI** — ditolak untuk sekarang (cost > benefit untuk frekuensi tahunan). Disiapkan desain hybrid jika nanti frekuensi naik ke bulanan.
- **Opsi C Hybrid (code default + DB override)** — disimpan sebagai rencana cadangan; tidak diimplementasi sekarang.

## Cara Ganti TTR di Kemudian Hari

1. Edit `app/config/jenis-tiket.ts` → ubah `slaOverrideHours`/`ttrLabel` di 1 entry (1 key = 1 baris). Jangan ubah angka di `ttr-comply.ts`/`effective.ts`.
2. Untuk rule kondisional (mis. TOP OLO 7→8), edit `ttr-comply.ts:getTopOloHours` / `getKTierHours`.
3. `npm run build` harus lolos.
4. Jika perlu recompute historis: `npx tsx scripts/backfill-ttr-comply.ts` (atau scoped by `jenis_tiket_2`).
5. Riwayat tercatat di `git log` + update ADR ini.

## Referensi

- `app/config/jenis-tiket.ts:1` header panduan
- `app/libs/tickets/ttr-comply.ts:37` K-tier + `66` TOP OLO + `134` SQM-CCAN WH
- `app/libs/tickets/effective.ts:1` sinkronisasi fallback
- `lib/projection/index.ts:578`
- Commit `0fb3c94` (netral 3-segmen), `48af93c` (DATIN K1/K2/K3)
