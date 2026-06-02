# Connection Budget

## Prinsip

Project ini tidak hanya punya web server. Ada beberapa proses Prisma/worker:
- web app
- ingestion worker
- projection worker
- active refresh worker
- status refresh worker
- ops worker

Karena itu total connection budget MySQL harus dihitung per proses, bukan per app saja.

## Baseline operasional

Dengan konfigurasi yang sebelumnya direkomendasikan:
- web: `connection_limit=12`
- ingestion worker: pakai Prisma pool default process-level
- projection worker: pakai Prisma pool default process-level
- active refresh worker: pakai Prisma pool default process-level
- status refresh worker: pakai Prisma pool default process-level
- ops worker: pakai Prisma pool default process-level

## Risiko

- jika semua proses punya pool longgar, MySQL bisa overcommit
- `P2024` muncul ketika pool terlalu kecil atau query terlalu lambat
- worker background bisa berebut koneksi dengan request user

## Rekomendasi kerja Phase 2

1. ukur `SHOW STATUS LIKE 'Threads_connected'`
2. ukur `SHOW STATUS LIKE 'Max_used_connections'`
3. cocokkan dengan jumlah proses PM2 aktif
4. dokumentasikan target limit per proses
5. jangan naikkan concurrency worker sebelum budget koneksi jelas

## Catatan

- worker ingestion dan projection lebih baik dibatasi lewat batch/transaction tuning dulu, bukan menambah concurrency
- jika load API tinggi, lebih aman optimalkan query dan index sebelum menambah `connection_limit`
