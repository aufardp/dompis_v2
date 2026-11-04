import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { getBranchServiceAreaNames } from '@/app/helpers/ticket.helpers';
import { ApiError } from '@/app/libs/apiError';
import { checkPriorityAccess } from './access';
import { BRANCH_LIST } from './constants';
import { BranchFullPrioritySummary, PriorityBranchCode, PrioritySummaryData } from './types';
import { PrioritySelection, PrioritySourceRow, selectPriorityRows, summarizePriorityBranch } from './model';

async function requirePriorityAccess(userId?: number, roleKey?: string) {
  if (userId && roleKey && !(await checkPriorityAccess(userId, roleKey)).hasAccess) {
    throw new ApiError(403, 'Anda tidak punya akses ke halaman Priority 5 Branch.');
  }
}

async function loadBranch(branch: PriorityBranchCode) {
  return getOrSetCache(`priority:branch:v3:${branch}`, async () => {
    const definition = BRANCH_LIST.find(item => item.code === branch)!;
    const workzones = await getBranchServiceAreaNames(definition.id);
    const now = new Date();
    if (!workzones.length) return { as_of: now.toISOString(), rows: [] as PrioritySourceRow[] };
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const start = new Date(`${day}T00:00:00+07:00`);
    const windowStart = new Date(now.getTime() - 30 * 86400000);
    const recurring = `UPPER(TRIM(t.jenis_tiket_2)) IN ('SQM','UNSPEC','UNDERSPEC')
      AND t.service_no IS NOT NULL AND TRIM(t.service_no) <> ''
      AND LEFT(UPPER(TRIM(t.service_no)),2) <> 'NN'
      AND LEFT(UPPER(TRIM(t.service_no)),8) NOT IN ('DEFAULT-','DEFAULT_')
      AND LEFT(UPPER(TRIM(t.service_no)),5) <> 'DUMMY'`;
    const rows = await prisma.$queryRawUnsafe<PrioritySourceRow[]>(`
      SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone,
        t.jenis_tiket_2, t.customer_type, t.flagging_manja, t.reported_date_dt,
        t.booking_date, t.resolve_date, t.status, t.status_update,
        0 AS tickets_30d,
        0 AS reg_hvc_30d,
        CASE WHEN ${recurring} THEN
          (SELECT h.incident FROM ticket h WHERE h.service_no = t.service_no
            AND h.reported_date_dt >= DATE_SUB(t.reported_date_dt, INTERVAL 30 DAY)
            AND h.reported_date_dt <= t.reported_date_dt AND h.id_ticket <> t.id_ticket
            AND UPPER(TRIM(h.jenis_tiket_2)) IN ('REG','REGULER','HVC')
            ORDER BY h.reported_date_dt DESC, h.id_ticket DESC LIMIT 1)
          ELSE NULL END AS last_reg_hvc_incident
      FROM ticket t
      WHERE t.workzone IN (${workzones.map(() => '?').join(',')})
        AND UPPER(TRIM(t.jenis_tiket_2)) IN ('REG','REGULER','HVC','SQM','UNSPEC','UNDERSPEC')
        AND (((t.status IS NULL OR UPPER(TRIM(t.status)) NOT IN ('CLOSED','CLOSE','FINALCHECK','MEDIACARE','SALAMSIM','RESOLVED'))
          AND (t.status_update IS NULL OR LOWER(TRIM(t.status_update)) NOT IN ('close','closed')))
          OR (t.reported_date_dt >= ? AND t.reported_date_dt <= ?))
      ORDER BY t.reported_date_dt DESC, t.id_ticket DESC
    `, ...workzones, start, now);

    // Count history once per distinct service number instead of running two
    // correlated COUNT subqueries for every candidate ticket.
    const serviceNos = [...new Set(rows
      .filter(row => {
        const jenis = (row.jenis_tiket_2 ?? '').trim().toUpperCase();
        const serviceNo = (row.service_no ?? '').trim().toUpperCase();
        return ['SQM', 'UNSPEC', 'UNDERSPEC'].includes(jenis)
          && serviceNo !== ''
          && serviceNo !== 'NN'
          && !serviceNo.startsWith('DEFAULT-')
          && !serviceNo.startsWith('DEFAULT_')
          && !serviceNo.startsWith('DUMMY');
      })
      .map(row => row.service_no!)
    )];
    const historyByService = new Map<string, { tickets: number; regHvc: number }>();
    const HISTORY_BATCH_SIZE = 500;
    for (let offset = 0; offset < serviceNos.length; offset += HISTORY_BATCH_SIZE) {
      const batch = serviceNos.slice(offset, offset + HISTORY_BATCH_SIZE);
      const history = await prisma.$queryRaw<Array<{
        service_no: string;
        tickets_30d: bigint | number;
        reg_hvc_30d: bigint | number;
      }>>(Prisma.sql`
        SELECT h.service_no,
          SUM(CASE WHEN UPPER(TRIM(h.jenis_tiket_2)) IN ('SQM','UNSPEC','UNDERSPEC') THEN 1 ELSE 0 END) AS tickets_30d,
          SUM(CASE WHEN UPPER(TRIM(h.jenis_tiket_2)) IN ('REG','REGULER','HVC') THEN 1 ELSE 0 END) AS reg_hvc_30d
        FROM ticket h
        WHERE h.service_no IN (${Prisma.join(batch)})
          AND h.reported_date_dt >= ${windowStart}
          AND h.reported_date_dt <= ${now}
          AND UPPER(TRIM(h.jenis_tiket_2)) IN ('SQM','UNSPEC','UNDERSPEC','REG','REGULER','HVC')
        GROUP BY h.service_no
      `);
      for (const row of history) {
        historyByService.set(row.service_no, {
          tickets: Number(row.tickets_30d),
          regHvc: Number(row.reg_hvc_30d),
        });
      }
    }

    return { as_of: now.toISOString(), rows: rows.map(row => {
      const history = row.service_no ? historyByService.get(row.service_no) : undefined;
      return {
        ...row,
        tickets_30d: history?.tickets ?? 0,
        reg_hvc_30d: history?.regHvc ?? 0,
      };
    }) };
  }, 30);
}

export async function queryAllPrioritySummary(userId?: number, roleKey?: string): Promise<PrioritySummaryData> {
  await requirePriorityAccess(userId, roleKey);
  const summaries: BranchFullPrioritySummary[] = [];
  const branchConcurrency = 2;
  for (let offset = 0; offset < BRANCH_LIST.length; offset += branchConcurrency) {
    const batch = await Promise.all(BRANCH_LIST.slice(offset, offset + branchConcurrency).map(async branch => {
      const data = await loadBranch(branch.code);
      return summarizePriorityBranch(branch.code, branch.name, data.rows, new Date(data.as_of));
    }));
    summaries.push(...batch);
  }
  return {
    last_update: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\./g, ':'),
    total_saldo_open: summaries.reduce((sum, branch) => sum + branch.card.total_open, 0),
    total_over_sla: summaries.reduce((sum, branch) => sum + branch.reguler_summary.osla, 0),
    branches: Object.fromEntries(summaries.map(branch => [branch.code, branch])) as PrioritySummaryData['branches'],
  };
}

export async function queryPriorityTickets(branch: PriorityBranchCode, selection: PrioritySelection, userId?: number, roleKey?: string) {
  await requirePriorityAccess(userId, roleKey);
  const data = await loadBranch(branch);
  return selectPriorityRows(data.rows, selection, new Date(data.as_of));
}

export async function queryCandidateSummary(branch: PriorityBranchCode, userId?: number, roleKey?: string) {
  return (await queryAllPrioritySummary(userId, roleKey)).branches[branch];
}

export async function queryTtrRows(branch: PriorityBranchCode, userId?: number, roleKey?: string) {
  return { rows: await queryPriorityTickets(branch, { kind: 'reguler' }, userId, roleKey) };
}
