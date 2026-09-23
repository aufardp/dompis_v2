import { Prisma } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { format, subDays, startOfDay } from 'date-fns';
import prisma from '@/app/libs/prisma';
import { buildRekapBucketFilterSql } from '@/lib/rekap/rekap-cell-filter';
import { buildTicketRoleScopeSql } from '@/app/libs/tickets/scope';
import { getWorkHourCategory } from '@/app/libs/tickets/ttr-comply';
import { parseWIBDateInput } from '@/app/utils/datetime';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';

export type Period = 'today' | 'week' | 'month';

export interface TtrComplianceOverviewData {
  period: Period;
  mttrSeconds: number | null;
  mttrFormatted: string;
  complyTotal: number;
  notComplyTotal: number;
  workHourCount: number;
  nonWorkHourCount: number;
  sqmWorkHourCompliance: { totalClose: number; comply: number; notComply: number; percent: number; target: number | null; achievement: number | null };
  tiers: Record<string, { totalClose: number; comply: number; notComply: number; percent: number; target: number | null; achievement: number | null }>;
}

export interface SqmDailyTrendDay {
  date: string;
  open: number;
  workHour: number;
  nonWorkHour: number;
}

export interface AssuranceGuaranteeData {
  total: number;
  gamasTotal: number;
  nonGamasTotal: number;
  tiers: Record<string, { gamas: number; nonGamas: number }>;
  target: number | null;
}

const TIER_KEYS = ['diamond', 'platinum', 'gold', 'reguler'] as const;
type TierKey = (typeof TIER_KEYS)[number];

const CUSTOMER_TYPE_TO_TIER: Record<string, TierKey> = {
  HVC_DIAMOND: 'diamond', HVC_PLATINUM: 'platinum', HVC_GOLD: 'gold', REGULER: 'reguler',
};

interface ClosedTicketRow {
  status: string | null; closed_at: Date | null; resolve_date: Date | null;
  reported_date: string | null; booking_date: string | null; customer_segment: string | null;
  customer_type: string | null; source_ticket: string | null; flagging_manja: string | null;
  jenis_tiket_1: string | null; ttr_comply_status: string | null;
}

interface SegCompliance { totalClose: number; comply: number; notComply: number; gamas: { comply: number; notComply: number }; nonGamas: { comply: number; notComply: number }; }
function emptySegCompliance(): SegCompliance { return { totalClose: 0, comply: 0, notComply: 0, gamas: { comply: 0, notComply: 0 }, nonGamas: { comply: 0, notComply: 0 } }; }
function tally(seg: SegCompliance, status: 'comply' | 'not_comply', gamas: boolean) {
  seg.totalClose += 1;
  if (status === 'comply') { seg.comply += 1; (gamas ? seg.gamas : seg.nonGamas).comply += 1; }
  else { seg.notComply += 1; (gamas ? seg.gamas : seg.nonGamas).notComply += 1; }
}

export async function computeTtrComplianceOverview(
  period: Period, isSuperAdmin: boolean, workzones: string[] | null, selectedWorkzone?: string, branchSas?: string[] | null,
): Promise<TtrComplianceOverviewData> {
  const { getTodayWibRange, getWeekWibRange, getMonthWibRange } = await import('@/lib/timezone');
  const { computeMttrSeconds, formatMttr } = await import('@/app/libs/tickets/mttr');
  const { isGamasTicket, isManjaP1Ticket, computeManjaCompliance, computeSqmWorkHourCompliance } = await import('@/app/libs/tickets/ttr-comply');
  const range = period === 'week' ? getWeekWibRange() : period === 'month' ? getMonthWibRange() : getTodayWibRange();
  const [baseWhere, baseParams] = buildTicketRoleScopeSql({ isSuperAdmin, workzones, selectedWorkzone, branchSas: branchSas ?? null });

  const tickets = await prisma.$queryRawUnsafe<ClosedTicketRow[]>(
    withMaxExecutionTime(`SELECT status, closed_at, resolve_date, reported_date, booking_date, customer_segment, customer_type, source_ticket, flagging_manja, jenis_tiket_1, ttr_comply_status FROM ticket WHERE (${baseWhere}) AND ( (resolve_date >= ? AND resolve_date <= ?) OR (resolve_date IS NULL AND closed_at >= ? AND closed_at <= ?) )`),
    ...baseParams, range.start, range.end, range.start, range.end,
  );

  const mttrSeconds = computeMttrSeconds(tickets.map(t => ({ reportedDate: t.reported_date, closedAt: t.resolve_date ?? t.closed_at })));
  let complyTotal = 0, notComplyTotal = 0;
  const tiers: Record<TierKey, SegCompliance> = { diamond: emptySegCompliance(), platinum: emptySegCompliance(), gold: emptySegCompliance(), reguler: emptySegCompliance() };
  const manja = emptySegCompliance();
  let workHourCount = 0, nonWorkHourCount = 0;
  const sqmWorkHour = emptySegCompliance();

  for (const t of tickets) {
    const gamas = isGamasTicket(t.source_ticket);
    if (t.ttr_comply_status === 'comply' || t.ttr_comply_status === 'not_comply') {
      complyTotal += t.ttr_comply_status === 'comply' ? 1 : 0; notComplyTotal += t.ttr_comply_status === 'not_comply' ? 1 : 0;
      const tierKey = t.customer_type ? CUSTOMER_TYPE_TO_TIER[t.customer_type.trim().toUpperCase()] : undefined;
      if (tierKey) tally(tiers[tierKey], t.ttr_comply_status, gamas);
    }
    if (isManjaP1Ticket(t.flagging_manja)) { const r = computeManjaCompliance({ status: t.status, resolveAt: t.resolve_date, bookingDate: t.booking_date, flaggingManja: t.flagging_manja }); if (r.status) tally(manja, r.status, gamas); }
    const isSqm = (t.source_ticket ?? '').trim().toLowerCase() === 'proactive' && (t.jenis_tiket_1 ?? '').toLowerCase().includes('sqm');
    if (isSqm) { const r = computeSqmWorkHourCompliance({ status: t.status, resolveAt: t.resolve_date, reportedDate: t.reported_date }); if (r.workHour === 'work_hour') workHourCount += 1; else if (r.workHour === 'non_work_hour') nonWorkHourCount += 1; if (r.status) tally(sqmWorkHour, r.status, gamas); }
  }

  const targets = await prisma.kpiTarget.findMany();
  const targetMap = new Map(targets.map(t => [t.metricKey, Number(t.targetValue)]));
  const withPercent = (seg: SegCompliance, targetKey: string) => { const p = seg.totalClose > 0 ? Math.round((seg.comply / seg.totalClose) * 1000) / 10 : 0; return { ...seg, percent: p, target: targetMap.get(targetKey) ?? null, achievement: targetMap.has(targetKey) && targetMap.get(targetKey)! > 0 ? Math.round((p / targetMap.get(targetKey)!) * 1000) / 10 : null }; };
  return { period, mttrSeconds, mttrFormatted: formatMttr(mttrSeconds), complyTotal, notComplyTotal, workHourCount, nonWorkHourCount, sqmWorkHourCompliance: withPercent(sqmWorkHour, 'ttr_comply_sqm_4h'), tiers: { manja: withPercent(manja, 'ttr_comply_manja'), diamond: withPercent(tiers.diamond, 'ttr_comply_diamond'), platinum: withPercent(tiers.platinum, 'ttr_comply_platinum'), gold: withPercent(tiers.gold, 'ttr_comply_gold'), reguler: withPercent(tiers.reguler, 'ttr_comply_reguler') } };
}

export async function computeSqmDailyTrend(
  isSuperAdmin: boolean, workzones: string[] | null, selectedWorkzone?: string, branchSas?: string[] | null,
): Promise<{ days: SqmDailyTrendDay[] }> {
  const [baseWhere, baseParams] = buildTicketRoleScopeSql({ isSuperAdmin, workzones, selectedWorkzone, branchSas: branchSas ?? null });
  const bucketWhere = buildRekapBucketFilterSql('kpi_customer');
  const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
  const startWib = startOfDay(subDays(wibNow, 28 - 1));
  const startWibStr = format(startWib, 'yyyy-MM-dd 00:00:00');

  const tickets = await prisma.$queryRawUnsafe<{ reported_date: string | null }[]>(
    withMaxExecutionTime(`SELECT t.reported_date FROM ticket t WHERE (${baseWhere}) AND (${bucketWhere}) AND t.reported_date >= ?`),
    ...baseParams, startWibStr,
  );

  const dayMap = new Map<string, { date: string; open: number; workHour: number; nonWorkHour: number }>();
  for (let i = 0; i < 28; i++) { const d = subDays(wibNow, 28 - 1 - i); const key = format(d, 'yyyy-MM-dd'); dayMap.set(key, { date: key, open: 0, workHour: 0, nonWorkHour: 0 }); }
  for (const t of tickets) { const reported = parseWIBDateInput(t.reported_date); if (!reported) continue; const dayKey = format(toZonedTime(reported, 'Asia/Jakarta'), 'yyyy-MM-dd'); const entry = dayMap.get(dayKey); if (!entry) continue; entry.open += 1; const workHour = getWorkHourCategory(t.reported_date); if (workHour === 'work_hour') entry.workHour += 1; else if (workHour === 'non_work_hour') entry.nonWorkHour += 1; }
  return { days: [...dayMap.values()] };
}

export async function computeAssuranceGuarantee(
  isSuperAdmin: boolean, workzones: string[] | null, selectedWorkzone?: string, branchSas?: string[] | null,
): Promise<AssuranceGuaranteeData> {
  const { getRecurringDisruptionTickets } = await import('@/app/libs/tickets/recurring-disruption');
  const [baseWhere, baseParams] = buildTicketRoleScopeSql({ isSuperAdmin, workzones, selectedWorkzone, branchSas: branchSas ?? null });
  const rows = await getRecurringDisruptionTickets(baseWhere, baseParams);
  const tiers: Record<TierKey, { gamas: number; nonGamas: number }> = { diamond: { gamas: 0, nonGamas: 0 }, platinum: { gamas: 0, nonGamas: 0 }, gold: { gamas: 0, nonGamas: 0 }, reguler: { gamas: 0, nonGamas: 0 } };
  let gamasTotal = 0, nonGamasTotal = 0;
  for (const row of rows) { const gamas = row.source_ticket === 'GAMAS'; if (gamas) gamasTotal += 1; else nonGamasTotal += 1; const tierKey = row.customer_type ? CUSTOMER_TYPE_TO_TIER[row.customer_type.trim().toUpperCase()] : undefined; if (tierKey) { if (gamas) tiers[tierKey].gamas += 1; else tiers[tierKey].nonGamas += 1; } }
  const target = await prisma.kpiTarget.findUnique({ where: { metricKey: 'assurance_guarantee' } });
  return { total: rows.length, gamasTotal, nonGamasTotal, tiers, target: target ? Number(target.targetValue) : null };
}
