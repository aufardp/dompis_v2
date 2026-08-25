/**
 * Scope WHERE murni role/workzone/branch, TANPA restriksi tanggal apapun —
 * dipakai endpoint yang butuh rentang periode sendiri (mingguan/bulanan),
 * karena `DailyTicketService.buildDailyTicketWhere` selalu membatasi tiket
 * closed ke `closed_at >= todayStart` (lihat `applyDailyTicketFilter`),
 * terlepas dari filter tanggal apapun yang ditambahkan di atasnya — cocok
 * untuk dashboard "hari ini", tapi salah untuk laporan mingguan/bulanan.
 */
export function buildTicketRoleScopeSql(params: {
  isSuperAdmin: boolean;
  workzones: string[] | null;
  selectedWorkzone?: string;
  branchSas: string[] | null;
}): [string, unknown[]] {
  let scope: string[] | null = null;

  if (params.selectedWorkzone) {
    scope = [params.selectedWorkzone];
  } else if (!params.isSuperAdmin) {
    scope = params.workzones ?? [];
  }

  if (params.branchSas !== null) {
    scope = scope
      ? scope.filter((w) => params.branchSas!.includes(w))
      : params.branchSas;
  }

  if (scope === null) return ['1=1', []];
  if (scope.length === 0) return ['1=0', []];

  const placeholders = scope.map(() => '?').join(',');
  return [`workzone IN (${placeholders})`, scope];
}
