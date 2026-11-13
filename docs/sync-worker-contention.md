# Perbaikan antrean writer dan projection

Log 11 November memperlihatkan retry ingestion berulang sekitar 120 detik, sementara writer yang aktif mengambil kembali lock dalam beberapa milidetik. Beberapa transaksi projection memerlukan lebih dari 50 detik untuk sepuluh record. Patch ini menangani koordinasi dan pekerjaan tulis berulang; waktu tunggu MySQL tetap perlu diukur di produksi.

## Perubahan

- Seluruh pemanggil `withTicketRawWriterLock` mendaftar FIFO di Redis sebelum mencoba lock eksklusif yang sudah ada. Waiter yang dibatalkan atau selesai dibersihkan. Lease waiter yang mati kedaluwarsa setelah sepuluh detik secara default. Lock write tetap diperpanjang selama transaksi berjalan.
- Timeout antrean memiliki kode `TICKET_RAW_WRITER_LOCK_TIMEOUT`, durasi tunggu, owner yang menghalangi, dan posisi antrean. Log retry menyimpan pesan error, kode, tipe timeout, serta durasi operasi.
- Record identik hanya memperbarui `lastSeenAt` melalui UPDATE berparameter bila timestamp lebih tua dari satu menit. Payload, hash, version, dan importedAt tidak ditulis ulang. Checkpoint ingestion tetap satu transaksi dengan hasil batch.
- Projection legacy memakai potongan waktu 30 detik, diperiksa setelah commit batch. Query yang masih berjalan tidak diputus oleh budget ini. Batch baru dari sinyal ingestion atau `projection_request` mendapat satu giliran sebelum satu giliran backlog. Batch yang besar dilanjutkan dengan cursor tersendiri dan tidak menggeser cursor backlog. Permintaan diakui setelah batch selesai; run yang masih memiliki kelanjutan dijadwalkan lagi.
- Jalur revision tetap mengikuti flag yang sedang dipakai. Aktivasi revision membutuhkan migration dan nilai flag konsisten pada seluruh proses, sesuai README.

## Optimasi lanjutan 13 November

- Batch prioritas hanya memilih raw yang belum mempunyai projection log sukses dengan hash/version sama dan tiket tujuan yang masih ada. Sinyal baru pada batch yang sedang bertambah tetap memeriksa perubahan; seluruh payload lama tidak diproses ulang. Cursor backlog tetap terpisah.
- Baris `skipped` yang projection log-nya sudah sesuai tidak menulis ulang log. Batch prioritas yang seluruhnya sudah sesuai tidak membuka transaksi write. Pada backlog, checkpoint tetap disimpan agar kemajuan tidak hilang.
- Ingestion membaca `lastSeenAt` bersama identitas yang dikunci. Record yang baru terlihat dalam satu menit tidak mengirim UPDATE heartbeat. Raw payload dan extension hanya dibentuk untuk record yang berubah. Bootstrap revision untuk raw lama tetap berjalan meskipun heartbeat masih baru.
- Pembersihan validation flag memilih maksimal 100 ID tiket closed per menit dan memperbarui hanya ID tersebut dengan pemeriksaan status ulang. Pekerjaan ini berjalan setelah giliran backlog, termasuk saat backlog masih panjang, dan tidak berada di jalur batch prioritas.
- Lock writer rutin dicatat pada level debug (`LOG_LEVEL=debug`), sedangkan waktu tunggu dan kegagalan tetap warn/error. Tanggal checkpoint diserialisasi sebagai ISO. Log task projection memuat hasil fresh batch serta `totalProcessed`, karena durasi task mencakup fresh batch dan backlog.
- Penarikan single incident memakai satu percobaan HTTP per endpoint per percobaan queue. Retry tiga kali dikelola queue dengan backoff, sehingga tidak berlipat dengan empat retry HTTP. Timeout memuat endpoint, incident, durasi, dan kode `TIMEOUT`; respons HTML mendapat kode `INVALID_RESPONSE`. Error permanen Bridge tidak dicoba ulang oleh queue. Log sukses HTTP baru muncul setelah body selesai dibaca dan JSON berhasil diparse.
- Diagnostik menampilkan host/port/nama database tanpa kredensial, serta kode Prisma/MySQL dan pesan error view diagnostik. Nilai revision CLI tetap tidak mewakili environment PM2; log startup projection kini mencantumkan flag proses worker.

## Ingestion incident massal

API memakai autentikasi/role yang sama dengan ingestion tunggal. Pengguna hanya dapat membaca batch yang ia kirim. Tidak ada migration baru atau perubahan rate limit global Bridge; worker single incident tetap satu concurrent job.

`POST /api/admin/ingest-incidents` menerima:

```json
{
  "requestId": "6a7f1d02-1db6-4c65-9c75-c111d325ab41",
  "incidents": ["INC52661271", "INC51123643"]
}
```

`incidents` juga dapat berupa teks dengan pemisah baris, spasi, koma, atau titik koma. Input dinormalisasi menjadi huruf besar dan duplikat dihapus. Maksimal 200 ID unik, format `INC` diikuti 6–20 digit, dan body maksimal 32 KB. Daftar yang mengandung ID tidak valid ditolak seluruhnya sebelum pengantrean.

Client membuat UUID `requestId` sekali sebelum submit dan mempertahankannya saat respons hilang atau terjadi kegagalan parsial. Mengirim ulang ID yang sama dengan daftar yang sama melanjutkan pengantrean. Daftar berbeda dengan ID sama mendapat HTTP 409. `GET /api/admin/ingest-incidents?requestId=<UUID>` mengembalikan report beserta `items`, `completed`, `succeeded`, `failed`, `pendingEnqueue`, dan `terminal`. Kedua endpoint memerlukan sesi pengguna; request ID bukan pengganti autentikasi.

Batch dan hasil yang sudah dibaca disimpan di Redis selama 24 jam. Job aktif untuk incident yang sama dibagi antarpermintaan melalui deduplikasi atomik BullMQ. Submit baru setelah job selesai membuat pekerjaan baru, sedangkan pengulangan UUID lama tetap mengacu pada pekerjaan lama. Error satu incident tidak menghentikan incident lain. Job `completed` dengan hasil bisnis `success:false` dilaporkan gagal. Jika status job telah dibersihkan sebelum dibaca, report menyatakan tidak tersedia, bukan berhasil.

Jika `pendingEnqueue > 0`, kirim ulang POST dengan UUID dan daftar yang sama. Jika beberapa incident gagal terminal, buat UUID baru dengan hanya ID yang gagal. HTTP 202 berarti diterima antrean; keberhasilan data baru dinyatakan oleh hasil per incident. Request POST dibatasi 10/menit dan pembacaan status 60/menit; gunakan polling sekitar lima detik.

### Pemakaian halaman admin

Buka **Ingest Insiden** di sidebar atau `/admin/ingest-incident`. Tempel satu atau banyak ID, perbaiki ID yang tidak valid, lalu pilih **Tarik incident**. Form menampilkan jumlah ID unik dan duplikat sebelum dikirim. Pengantrean massal mengikuti rate limit Bridge bersama; 200 ID tidak berarti 200 request HTTP paralel.

Halaman menampilkan progres, hasil per incident, serta filter belum selesai/gagal/berhasil. **Coba ulang yang gagal** membuat permintaan baru berisi ID gagal saja. **Lanjutkan pengiriman** mempertahankan UUID dan daftar awal saat respons terputus atau pengantrean belum lengkap. **Periksa status** tidak membuat pekerjaan baru. Setelah selesai, **Daftar baru** mengosongkan form dan mengembalikan fokus ke input.

UUID tersimpan di alamat halaman; daftar awal disimpan di sessionStorage dengan kunci per pengguna untuk melanjutkan submit yang responsnya hilang. Muat ulang halaman membaca hasil dari server tanpa POST otomatis. Alamat dapat dibuka kembali oleh pengguna yang mengirimnya selama masa penyimpanan 24 jam. Otorisasi server tetap wajib.

Desain mengikuti komponen admin Dompis, dengan ENERGY 1 / RHYTHM 2 / MOTION 1. Warna biru memusatkan tindakan utama dan progres; hijau/merah disertai label hasil. Form dibatasi lebarnya untuk membaca daftar, sedangkan hasil memakai dua kolom pada layar lebar dan susunan vertikal di ponsel. Inter dan Outfit mengikuti identitas aplikasi. Jarak 32 px memisahkan input, status permintaan, dan hasil. Tidak ada ilustrasi, ikon, aset, atau struktur navigasi baru. Viewport khusus halaman mengaktifkan zoom pengguna.

### Bukti uji UI dan Delivery Gate antislop

Lingkup gate: fitur di `[data-incident-ingestion]` beserta tautan kembali dan hint sidebar yang diubah. Komponen admin bersama lainnya tidak diaudit ulang dalam patch ini. Uji Chrome memakai respons API fixture terisolasi, sehingga angka pada screenshot bukan data produksi. Skrip `scripts/test-bulk-incident-browser.cjs` mencatat 15 pemeriksaan alur, 10 kombinasi lebar/tema, dan tidak menemukan uncaught browser exception. Bukti lokal: `/private/tmp/dompis-bulk-ui-evidence.json`, screenshot `/private/tmp/dompis-bulk-ui-{light,dark}{,-mobile}.png`.

Jalankan server pengembangan lokal pada port 3109 dengan `JWT_ACCESS_SECRET=dompis-local-ui-fixture-secret`, URL database/Redis fixture, `QOSMIC_BRIDGE_ENABLED=false`, dan `CRON_ENABLED=false`; lalu `node scripts/test-bulk-incident-browser.cjs`. Semua request `/api/*` browser dicegat menjadi fixture. `BULK_UI_BASE_URL` hanya menerima localhost/127.0.0.1; `CHROME_BINARY` dapat menentukan executable Chrome. Jangan gunakan secret fixture untuk aplikasi produksi.

- R-02 PASS: pencarian teks fitur tidak menemukan em dash.
- R-03 PASS: Chrome menguji 320, 375, 768, 1024, dan 1440 px pada kedua tema tanpa elemen fitur keluar viewport atau page overflow.
- R-17 PASS: jumlah dan progres berasal dari report; fixture hanya berada dalam skrip uji.
- R-18 PASS: fitur tidak memuat testimonial atau profil fiktif.
- R-23 PASS: memakai sidebar dan gaya aplikasi yang ada; tidak membuat aset atau struktur navigasi baru.
- R-24 PASS: tautan Alat admin diklik dan mencapai `/admin/tools`.
- R-25 PASS: pengukuran computed foreground/background Chrome memberi minimum 4,52:1; checker skill juga memverifikasi pasangan warna teks, error, dan fokus.
- R-26 PASS: submit, cek status, lanjutkan, retry gagal, daftar baru, keempat filter, dan tautan kembali dijalankan pada browser.
- R-27 PASS: browser memverifikasi kondisi kosong, sedang mengirim, antrean, selesai, filter kosong, HTTP 524, dan pengiriman parsial.
- R-28 PASS: tidak ada FAQ yang ditambahkan.
- R-32 PASS: Tab memperlihatkan outline 2 px; Enter mengirim form; reset mengembalikan fokus ke textarea.
- R-33 PASS: implementasi ditulis di source TSX/TS/CSS, bukan injeksi CSS runtime. Perubahan class/zoom skrip hanya untuk pengujian.
- R-34 PASS: seluruh matriks ukuran diperiksa dengan tema terang dan gelap.
- R-35 PASS: halaman dijalankan di Next dev dan klik seluruh kontrol fitur tercatat oleh skrip browser; TypeScript dan suite logika juga lulus.
- R-36 PASS: tidak ada klaim keamanan atau peningkatan kecepatan numerik pada UI; dampak produksi masih perlu diukur.
- R-37 PASS: Design Read mengikuti bahasa visual admin Dompis dan dials diumumkan sebelum implementasi.
- R-38 PASS: isi produksi berasal dari input dan report server; data rekaan dibatasi pada pengujian.
- R-01 PASS: fitur tidak menambahkan gradient atau glow.
- R-04 PASS: fitur tidak menambahkan ikon generik atau dekoratif.
- R-06 PASS: memakai Inter untuk input/hasil dan Outfit untuk judul sesuai aplikasi; tidak menambah monospace besar atau label uppercase.
- R-07 PASS: tidak menambahkan pola latar.
- R-08 PASS: tidak menambahkan panah dekoratif.
- R-09 PASS: status memakai teks, tanpa badge promosi atau label berulang di atas judul.
- R-10 PASS: tidak menambahkan glassmorphism.
- R-12 PASS: fitur tidak menambahkan shadow.
- R-13 PASS: fitur tidak menambahkan glow.
- R-14 PASS: hasil berupa daftar incident, tanpa kartu fitur seragam.
- R-19 PASS: tidak ada animasi template; progres berubah mengikuti report, sesuai MOTION 1.
- R-22 PASS: tidak ada ilustrasi baru.
- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 tercatat pada keputusan desain.
- Konsistensi dials PASS: form tenang, status singkat, hasil berulang; tidak ada motion dekoratif.
- Focal point PASS: tombol Tarik menjadi fokus sebelum submit, progres dan hasil menjadi fokus setelah submit.
- Whitespace PASS: pemisahan 32 px membedakan tiga tahap pekerjaan tanpa kartu tambahan.
- Accent PASS: biru dipakai untuk tindakan utama, fokus keyboard, dan progres; warna hasil membawa makna status.
- Identity motif PASS: judul Outfit dan baris incident mengikuti perangkat operasional Dompis.
- Design Read PASS: arah desain dinyatakan sebelum source UI ditulis.
- C-1 PASS: tujuan warna, susunan, tipografi, dan jarak dicatat pada keputusan desain.
- C-2 PASS: setiap kontrol fitur mempunyai perilaku yang diuji browser.
- C-3 PASS: setiap bagian melayani input ID, pemulihan permintaan, atau pemeriksaan hasil.
- C-4 PASS: fixture menguji error parsial, reload, tema, breakpoint, keyboard, dan reflow zoom 200%.
- C-5 PASS: tidak ada statistik, testimonial, atau klaim buatan pada UI produksi.
- R-05 PASS: komposisi mengikuti pekerjaan operator: form, status, lalu daftar hasil; tidak memakai template pemasaran.
- R-11 PASS: kontrol memakai rounded-lg dan progres radius 4 px; tidak memakai pil pada setiap elemen.
- R-15 PASS: label tindakan menyebut pekerjaan: Tarik, Periksa status, Lanjutkan pengiriman, dan Coba ulang yang gagal.
- R-16 PASS: teks menjelaskan pemisah ID, batas jumlah, status, dan cara pulih; tidak memakai buzzword pemasaran.
- R-20 PASS: daftar incident, status Nossa, dan hasil per incident menentukan susunan, dengan tipografi Dompis yang sudah ada.
- R-21 PASS: fitur mengikuti ThemeProvider dan kontrol tema aplikasi yang ada; kedua tema diverifikasi.
- R-29 PASS: netral, biru aksi, hijau sukses, dan merah gagal mempunyai fungsi masing-masing.
- R-30 PASS: memakai bahasa visual aplikasi sendiri; tidak menyalin produk eksternal.
- R-31 PASS: alasan keputusan utama ditulis pada bagian desain di atas.

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

Jalankan `npm run diagnose:sync-performance` pada server saat perlambatan terjadi. Perintah hanya membaca status database dan host, dengan dua sampel berjarak dua detik. Output tidak mencetak DATABASE_URL atau teks query pengguna. `unavailable: true` berarti query diagnostik gagal; periksa kode dan pesannya untuk membedakan izin, timeout, dan masalah lain. Nilai flag yang dilaporkan adalah environment proses CLI, sehingga nilai environment PM2 perlu diperiksa terpisah.

Bandingkan kenaikan counter lock/log wait, latency file, tekanan I/O, dan throttling CPU cgroup. Jangan menyimpulkan disk jenuh dari satu COMMIT lambat. Simpan laporan bersama waktu mulai/selesai build bila build berjalan bersamaan. Patch ini tidak mengubah parameter durability MySQL, ukuran chunk write, atau menaikkan konkurensi database.

## Pemeriksaan lokal

- Hasil 13 November: 42 pengujian `test:sync`, 40 pengujian integrasi MySQL/Redis, serta 15 pemeriksaan alur browser lulus. `npm run typecheck` dan build produksi web/worker lulus. Angka ini membuktikan perilaku fixture lokal, bukan throughput atau ketersediaan produksi.
- Laporan Delivery Gate di atas mencatat bukti per item. Kontras teks terendah yang diukur Chrome adalah 4,52:1; tombol fitur mempunyai tinggi minimal 44 px.
- `npm run test:sync`: replay heartbeat, klasifikasi timeout, giliran batch prioritas, serta guard ingestion/projection.
- `npm run test:sync:integration`: database MySQL terisolasi di port 13316. Uji ingestion massal memakai Redis terisolasi port 16379. Jalankan suite dengan `SYNC_TEST_REDIS_URL=redis://127.0.0.1:16379 WRITER_TEST_REDIS_URL=redis://127.0.0.1:16379 npm run test:sync:integration`.
- Pemeriksaan TypeScript worker: `node node_modules/typescript/bin/tsc -p tsconfig.workers.json --noEmit`.

Uji integrasi memakai database fixture yang dapat dihapus. Jangan arahkan ke produksi. Rollback menggunakan artefak aplikasi dan worker sebelumnya; schema tidak berubah dan antrean waiter sementara kedaluwarsa sendiri. Patch tidak membutuhkan reset checkpoint.
