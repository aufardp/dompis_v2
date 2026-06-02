# Datetime Migration Plan

## Masalah saat ini

Kolom berikut masih string:
- `ticket.reported_date`
- `ticket.booking_date`
- `ticket.status_date`
- `ticket_raw.reported_date`
- `ticket_raw.booking_date`
- `ticket_raw.status_date`
- `ticket_raw.date_modified`

Dampak:
- sorting dan range filter mahal
- parsing tanggal dilakukan di aplikasi
- index kurang efektif
- raw data yang formatnya tidak konsisten sulit divalidasi

## Strategi aman

### Phase A: additive columns
Tambahkan kolom baru typed tanpa menyentuh kolom lama.

Contoh:
- `ticket.reported_at_dt DATETIME NULL`
- `ticket.booking_at_dt DATETIME NULL`
- `ticket.status_at_dt DATETIME NULL`
- `ticket_raw.reported_at_dt DATETIME NULL`
- `ticket_raw.booking_at_dt DATETIME NULL`
- `ticket_raw.status_at_dt DATETIME NULL`
- `ticket_raw.source_modified_at_dt DATETIME NULL`

### Phase B: backfill
- backfill bertahap per batch kecil
- log invalid rows
- jangan pakai satu query update raksasa jika tabel besar

### Phase C: dual write
- ingestion/projection mulai menulis ke kolom lama dan kolom baru
- read path lama masih dipertahankan

### Phase D: switch read path
- query sorting/filtering pindah ke kolom typed
- EXPLAIN ulang query utama

### Phase E: cleanup
- hanya setelah stabil dan terukur
- kolom string lama tetap dipertahankan dulu untuk rollback cepat

## Validasi yang wajib

1. hitung total row yang punya string date non-null
2. hitung total row yang berhasil dibackfill ke typed column
3. daftar row invalid date
4. bandingkan hasil query lama vs query typed pada sample route

## Rollback

- jika switch read path bermasalah, kembali baca kolom string lama
- jangan drop kolom lama pada fase awal
