# Pagination Plan

## Endpoint yang masih offset-based

- `DailyTicketService.getDailyTicketTable`
- `TicketService.getTickets`

## Risiko

- page besar makin mahal
- `OFFSET` tinggi menyebabkan scan dan discard row
- performa memburuk seiring pertumbuhan data

## Strategi migrasi

1. pertahankan offset untuk kompatibilitas saat ini
2. tambahkan mode cursor baru pada endpoint yang paling berat
3. frontend pindah bertahap ke cursor mode
4. offset tetap tersedia sementara untuk admin tools tertentu

## Kandidat cursor key

- `reported_date + id_ticket`
- fallback: `id_ticket` jika sort stabil

## Catatan

Karena `reported_date` masih string, migrasi cursor sebaiknya dilakukan penuh setelah typed datetime tersedia.
