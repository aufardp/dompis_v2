# Filter Consistency Notes

## Area yang sudah dirapikan

- `DailyTicketService.getDailyStatsByServiceArea`
  - dept B2C/B2B memakai `buildDeptSegmentWhere()` (customer_segment-based)
  - fungsi dead `getB2CJenisWhereClause()` / `getB2BJenisWhereClause()` sudah dihapus

- `TicketService`
  - search utama sekarang memakai exact/prefix path dulu sebelum fallback `contains`

## Area yang masih perlu perhatian

- `workzone` masih campuran `contains` dan `in`
- `reported_date` string menyebabkan filter tanggal tidak benar-benar strong-typed
- beberapa summary route masih membangun filter sendiri di luar service helper

## Prinsip berikutnya

1. satu helper canonical untuk search ticket
2. satu helper canonical untuk dept / ticket type filter
3. route summary sebaiknya turunkan filter dari helper yang sama
