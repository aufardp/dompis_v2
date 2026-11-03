This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Webhook API (For Google Apps Script Integration)

This project includes a generic webhook API that allows teammates to queue events from Google Apps Script or other external services.

### Quick Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   WEBHOOK_API_KEYS="your_api_key_1,your_api_key_2"
   TECH_EVENTS_WEBHOOK_URL="https://your-target.com/webhook"
   TECH_EVENTS_WEBHOOK_ENABLED=true
   CRON_ENABLED=true
   ```

2. Start the server (cron must be enabled for dispatch):
   ```bash
   npm run dev
   ```

### Usage from Google Apps Script

```javascript
function sendWebhook() {
  UrlFetchApp.fetch('https://your-domain.com/api/webhook/queue', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
    payload: JSON.stringify({
      eventType: 'NOTIFICATION',
      payload: { message: 'Hello!' }
    })
  });
}
```

### Documentation

- 📖 **Full API Docs:** [`docs/WEBHOOK_API.md`](docs/WEBHOOK_API.md)
- 🚀 **Quick Start:** [`docs/WEBHOOK_QUICKSTART.md`](docs/WEBHOOK_QUICKSTART.md)
- 📝 **Implementation:** [`docs/IMPLEMENTATION_SUMMARY.md`](docs/IMPLEMENTATION_SUMMARY.md)

### Testing

```bash
export TEST_WEBHOOK_API_KEY="your_api_key_1"
npm run test:webhook
```

---

## Sinkronisasi Nossa dengan revision

Jalur revision menyimpan snapshot per sumber dan pekerjaan projection di MySQL. Raw, extension, revision, dan checkpoint ditulis dalam satu transaksi. Projection membaca pekerjaan pending; timestamp dan Redis Pub/Sub bukan penentu apakah suatu perubahan sudah diproses.

Fitur dikendalikan oleh `TICKET_SYNC_REVISIONS_ENABLED`, default `false`. Terapkan migration `20261103000000_ticket_sync_revisions`, generate Prisma Client, dan bangun aplikasi sebelum mengaktifkannya. Semua proses web, ingestion, Bridge, projection, import, dan skrip operasional harus memakai nilai flag yang sama. Hindari menjalankan writer lama bersamaan dengan writer revision saat cutover.

```sh
npx prisma migrate deploy
npm run build
```

Saat aktivasi PM2, ekspor `TICKET_SYNC_REVISIONS_ENABLED=true` pada environment yang membaca `ecosystem.config.js`, lalu restart seluruh proses terkait setelah writer lama selesai/drain. Mengubah `.env` saja tidak mengalahkan nilai yang sudah dipasang oleh PM2. Migration production dan restart tidak dijalankan sebagai bagian dari penulisan kode ini.

Setelah seluruh writer memakai flag baru, jalankan `npm run projection:initial` dengan environment yang sama untuk merekonsiliasi raw legacy. Periksa backlog pending sampai habis; satu run memiliki budget waktu. Scan berikutnya juga membuat state awal bagi raw identik yang belum memiliki revision.

Scheduler Bridge mengirim scan open setiap satu menit dan closed recent setiap dua menit, dengan dedup job aktif. Closed recent memakai `NOSSA_CLOSED_INCREMENTAL_DAYS` (default dua hari); ini bukan change feed. Sweep historis berjalan per minggu, dengan checkpoint window di database dan pemeriksaan antrean setiap jam. Setelah scan open lengkap berhasil, lookup terbatas mengonfirmasi ticket lama yang tidak terlihat; absensi tidak otomatis menutup ticket.

Semua request HTTP, retry, dan probe memakai limiter Redis atomik: maksimal 20 request/60 detik untuk aplikasi, dengan budget kelas non-backfill dan backfill. Limiter tidak dapat menghitung konsumen eksternal di luar aplikasi yang memakai kredensial sama. Ketika Redis tidak tersedia, request Bridge dipause dan projection pending di MySQL tetap dapat berjalan.

Snapshot dengan timestamp sumber lebih lama dilewati. Payload berbeda dengan timestamp sama atau tanpa urutan yang dapat dipercaya masuk quarantine; sistem mempertahankan nilai yang sudah diterima. Periksa `ingestion_run_log.status = 'partial'` dan `ingestion_quarantine` untuk konflik tersebut. Kebijakan ini sengaja tidak mengklaim bahwa waktu respons HTTP membuktikan versi sumber terbaru. Jaminan urutan dan kelengkapan upstream yang lebih kuat membutuhkan revision/delta atau snapshot pagination dari Bridge.

Nossa menjadi sumber utama. Piloting hanya melengkapi `contact_phone`, `contact_name`, `contact_email`, `street_address`, `customer_name`, `service_no`, `workzone`, dan `witel` ketika nilai Nossa kosong. Pelengkap kedaluwarsa setelah `PILOTING_COMPLEMENT_MAX_AGE_MS` (default 15 menit tanpa observasi ulang). Status dan resolve date tidak dilengkapi dari Piloting. Record legacy dengan owner Bridge menunggu snapshot Bridge sebelum Piloting dapat mengubah hasil gabungannya.

Ticket closed tetap menerima koreksi dan reopen dari sumber. Reopen manual menyimpan hash sumber saat tindakan dilakukan, sehingga replay snapshot closed yang sama tidak langsung membatalkannya. Snapshot sumber berbeda berikutnya diproses kembali. Ticket manual tetap dilindungi. Nilai preview mengikuti batas panjang kolom; payload sumber penuh tersimpan pada snapshot JSON.

Notifikasi setelah commit memiliki penanda durable. Cache ticket memakai versi unik yang ditangkap sebelum query dimulai. Cache dashboard tetap menggunakan stale-while-revalidate dan pembatas query; data yang berubah memicu refresh background dengan interval minimum `DASHBOARD_SYNC_REVALIDATE_SECONDS` (default 30 detik), lalu SSE memberitahu browser. Angka tersebut adalah interval refresh, bukan SLA sumber-sampai-browser.

Pengujian lokal:

```sh
npm run test:sync
npm run typecheck
npm run build:workers
```

Tes integration memakai MySQL khusus `dompis_sync_test` di `127.0.0.1:13316` dan Redis khusus di `127.0.0.1:13379`. Suite MySQL menolak database lain, menjalankan migration sidecar, dan membersihkan fixture di database uji. Jangan arahkan port tersebut ke database aplikasi. Schema lama `ticket_raw` melampaui batas row deklaratif pada konfigurasi default MySQL; lingkungan uji menggunakan `innodb_strict_mode=OFF` untuk membuat schema lama, tanpa mematikan strict SQL mode untuk penulisan data.

```sh
npm run test:sync:integration
npm run benchmark:sync
```

Verifikasi implementasi: 21 tes reliability/coverage dan 26 tes integrasi MySQL/Redis lulus; typecheck, build aplikasi, dan build worker lulus. Suite priority yang lebih luas masih mempunyai satu kegagalan `close_hi` yang juga direproduksi pada source HEAD sebelum perubahan ini. Konfigurasi ESLint repository belum mencakup file TypeScript, sehingga hasil lint tidak menjadi bukti validasi TypeScript.

Benchmark memakai 1.000 ticket sintetis, lima batch per workload, dan MySQL lokal, dibandingkan implementasi ingestion HEAD. Median batch:

| Data berubah | HEAD | Revision |
| --- | ---: | ---: |
| 0% (replay) | 388 ms | 163 ms |
| 1% | 407 ms | 172 ms |
| 10% | 356 ms | 216 ms |
| 100% | 567 ms | 650 ms |

Hasil bisnis yang diperiksa identik pada seluruh workload. Replay sekitar 58% lebih cepat, query turun dari 65 menjadi 27, dan SQL/parameter dari 1,80 MB menjadi 0,12 MB. Insert awal dan batch 100% berubah menanggung tambahan penulisan snapshot/revision; peningkatan tidak merata untuk semua pola beban. Angka ini mengukur ingestion lokal, bukan HTTP Bridge, projection sampai browser, atau SLA production. Benchmark menyimpan metrik insert awal satu sampel untuk diagnosis, bukan estimasi statistik.

Rollback awal mempertahankan tabel snapshot/state dan menghentikan writer/consumer baru setelah drain. Gunakan build kompatibel untuk pemulihan; kembali ke cursor lama dapat melewatkan pending yang sudah tercatat. Rekonsiliasi memindai raw bertahap dan membuat pending untuk revision/hash yang belum sesuai. Full reconciliation menjadwalkan seluruh gap, sedangkan worker menguras pending dalam run dengan budget waktu; periksa backlog sampai kosong sebelum menyatakan repair selesai.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
