// Facade tipis untuk domain Daily Ticket. Isi asli file ini (3521 baris,
// class DailyTicketService dengan ~30 static method) sudah dipecah jadi
// beberapa modul lebih kecil (daily-ticket-helpers/-where/-table/-kpi-matrix/
// -stats.ts) semata untuk memecah unit kompilasi `next build` jadi lebih
// kecil — file ini dulunya file terbesar di codebase dan dipakai oleh ~20
// file lain di seluruh repo, sehingga jadi kontributor utama RAM spike saat
// build. File ini hanya merakit ulang fungsi-fungsi tsb jadi objek
// `DailyTicketService` yang sama persis seperti sebelumnya — semua pemanggil
// existing (`DailyTicketService.xxx(...)`) tidak perlu berubah. Tidak ada
// perubahan logic.

import {
  buildSqlWhereClause,
  buildStatusCategorySql,
} from './daily-ticket-helpers';
import {
  applyDailyTicketFilter,
  buildDailyTicketWhere,
  buildMainTableWhere,
} from './daily-ticket-where';
import {
  countStatuses,
  getTicketStatusOptions,
  getTicketTypeOptions,
  getDailyTicketTable,
  getDailyTicketIds,
  buildDailyTicketSqlParams,
  getDailyTicketSummary,
  hasDailyTicketHit,
  hasDailyValidasiHit,
} from './daily-ticket-table';
import {
  getKpiBucketSummaryMatrix,
  getTicketManagementOverviewSummary,
} from './daily-ticket-kpi-matrix';
import {
  buildDetailWoHiWhere,
  getDailyStats,
  getDailyStatsByServiceArea,
  assignToUser,
  unassign,
  pickup,
  close,
  getHourlyTicketCounts,
  getHourlyCloseCounts,
  getDailyTrend,
  getTopSymptoms,
  getB2CBreakdown,
} from './daily-ticket-stats';

// Re-export module-level helpers yang sebelumnya diimpor langsung dari file
// ini oleh file lain (tickets.service.ts, lib/aggregation/summary-snapshot.ts).
export { buildSqlWhereClause, buildStatusCategorySql };

export const DailyTicketService = {
  applyDailyTicketFilter,
  buildDailyTicketWhere,
  buildMainTableWhere,
  countStatuses,
  getTicketStatusOptions,
  getTicketTypeOptions,
  getDailyTicketTable,
  getDailyTicketIds,
  buildDailyTicketSqlParams,
  getDailyTicketSummary,
  hasDailyTicketHit,
  hasDailyValidasiHit,
  getKpiBucketSummaryMatrix,
  getTicketManagementOverviewSummary,
  buildDetailWoHiWhere,
  getDailyStats,
  getDailyStatsByServiceArea,
  assignToUser,
  unassign,
  pickup,
  close,
  getHourlyTicketCounts,
  getHourlyCloseCounts,
  getDailyTrend,
  getTopSymptoms,
  getB2CBreakdown,
};
