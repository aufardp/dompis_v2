# Perbaikan antrean writer dan projection

Log 11 November memperlihatkan retry ingestion berulang sekitar 120 detik, sementara writer yang aktif mengambil kembali lock dalam beberapa milidetik. Beberapa transaksi projection memerlukan lebih dari 50 detik untuk sepuluh record. Patch ini menangani koordinasi dan pekerjaan tulis berulang; waktu tunggu MySQL tetap perlu diukur di produksi.

## Perubahan

- Seluruh pemanggil `withTicketRawWriterLock` mendaftar FIFO di Redis sebelum mencoba lock eksklusif yang sudah ada. Waiter yang dibatalkan atau selesai dibersihkan. Lease waiter yang mati kedaluwarsa setelah sepuluh detik secara default. Lock write tetap diperpanjang selama transaksi berjalan.
- Timeout antrean memiliki kode `TICKET_RAW_WRITER_LOCK_TIMEOUT`, durasi tunggu, owner yang menghalangi, dan posisi antrean. Log retry menyimpan pesan error, kode, tipe timeout, serta durasi operasi.
- Record identik hanya memperbarui `lastSeenAt` melalui UPDATE berparameter bila timestamp lebih tua dari satu menit. Payload, hash, version, dan importedAt tidak ditulis ulang. Checkpoint ingestion tetap satu transaksi dengan hasil batch.
- Projection legacy memakai potongan waktu 30 detik, diperiksa setelah commit batch. Query yang masih berjalan tidak diputus oleh budget ini. Batch baru dari sinyal ingestion atau `projection_request` mendapat satu giliran sebelum satu giliran backlog. Batch yang besar dilanjutkan dengan cursor tersendiri dan tidak menggeser cursor backlog. Permintaan diakui setelah batch selesai; run yang masih memiliki kelanjutan dijadwalkan lagi.
- Jalur revision tetap mengikuti flag yang sedang dipakai. Aktivasi revision membutuhkan migration dan nilai flag konsisten pada seluruh proses, sesuai README.

## Konfigurasi

| Variabel | Default | Kegunaan |
|---|---:|---|
| `TICKET_RAW_WRITER_WAIT_MS` | 120000 | Batas menunggu giliran writer |
| `TICKET_RAW_WRITER_POLL_MS` | 100 | Interval pemeriksaan giliran, minimum 25 ms |
| `TICKET_RAW_WRITER_QUEUE_LEASE_MS` | 10000 | Lease waiter yang belum mendapat giliran |
| `TICKET_RAW_WRITER_LOCK_TTL` | 300 | TTL lock write, diperpanjang selama transaksi |
| `PROJECTION_RUN_BUDGET_MS` | 30000 | Budget setiap giliran projection |

FIFO berlaku ketika semua writer memakai versi ini. Saat rollout campuran, lock lama tetap menjaga eksklusivitas, tetapi worker lama belum menghormati urutan antrean. Cursor batch prioritas disimpan di memori; setelah restart batch dapat dipindai ulang, dengan hash/version dan unique incident menjaga replay. Cursor backlog tetap tersimpan di MySQL.

## Penerapan

1. Bangun artefak worker dari versi yang sama dengan aplikasi.
2. Restart proses writer secara berurutan setelah transaksi lama selesai. Terapkan patch pada web, data, bridge, serta proses refresh/import yang aktif. Restart projection dengan artefak yang sama.
3. Periksa log `Ticket raw writer acquired after waiting`, `errorType`, `operationDurationMs`, dan `Projection fresh batch slice complete`. Posisi antrean yang makin kecil menunjukkan pembagian giliran berjalan.
4. Pastikan checkpoint backlog terus maju, pekerjaan baru selesai, dan jumlah pending menurun. Ukur ulang p95 durasi write dan frekuensi retry dengan beban yang sebanding.

Jalankan `npm run diagnose:sync-performance` pada server saat perlambatan terjadi. Perintah hanya membaca status database dan host, dengan dua sampel berjarak dua detik. Output tidak mencetak DATABASE_URL atau teks query pengguna. `unavailable: true` berarti view/izin diagnostik tersebut tidak tersedia. Nilai flag yang dilaporkan adalah environment proses CLI, sehingga nilai environment PM2 perlu diperiksa terpisah.

Bandingkan kenaikan counter lock/log wait, latency file, tekanan I/O, dan throttling CPU cgroup. Jangan menyimpulkan disk jenuh dari satu COMMIT lambat. Simpan laporan bersama waktu mulai/selesai build bila build berjalan bersamaan. Patch ini tidak mengubah parameter durability MySQL, ukuran chunk write, atau menaikkan konkurensi database.

## Pemeriksaan lokal

- `npm run test:sync`: replay heartbeat, klasifikasi timeout, giliran batch prioritas, serta guard ingestion/projection.
- `npm run test:sync:integration`: database MySQL terisolasi di port 13316 dan Redis terisolasi di port 13379. Uji Redis writer juga menerima `WRITER_TEST_REDIS_URL=redis://127.0.0.1:16379`.
- Pemeriksaan TypeScript worker: `node node_modules/typescript/bin/tsc -p tsconfig.workers.json --noEmit`.

Uji integrasi memakai database fixture yang dapat dihapus. Jangan arahkan ke produksi. Rollback menggunakan artefak aplikasi dan worker sebelumnya; schema tidak berubah dan antrean waiter sementara kedaluwarsa sendiri. Patch tidak membutuhkan reset checkpoint.
