// app/libs/priority/queries.ts

import prisma from '@/app/libs/prisma';
import { PriorityBranchCode, BranchFullPrioritySummary } from './types';
import { checkPriorityAccess } from './access';
import { resolveTtrBucket } from './ttr';
import { BRANCH_LIST } from './constants';
import { getBranchServiceAreaNames } from '@/app/helpers/ticket.helpers';

export async function queryCandidateSummary(branch: any, userId?: number, roleKey?: string): Promise<any> { return {} as any; }
export async function queryTtrRows(branch: any, userId?: number, roleKey?: string): Promise<any> { return { rows: [] }; }

export async function queryAllPrioritySummary(
  userId?: number,
  roleKey?: string
): Promise<{
  last_update: string;
  total_saldo_open: number;
  total_over_sla: number;
  branches: Record<PriorityBranchCode, BranchFullPrioritySummary>;
}> {
  if (userId && roleKey) {
    const { hasAccess } = await checkPriorityAccess(userId, roleKey);
    if (!hasAccess) {
      throw new Error('Anda tidak punya akses ke halaman Priority 5 Branch.');
    }
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const windowStartStr = windowStart.toISOString().slice(0, 19).replace('T', ' ');
  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartStr = todayStart.toISOString().slice(0, 19).replace('T', ' ');

  const branchesResult: Record<string, BranchFullPrioritySummary> = {};
  let totalSaldoOpen = 0;
  let totalOverSla = 0;

  for (const b of BRANCH_LIST) {
    const workzones = await getBranchServiceAreaNames(b.id);
    if (!workzones.length) {
      branchesResult[b.code] = {
        code: b.code,
        name: b.name,
        card: { reguler_open: 0, sqm_open: 0, underspec_open: 0, total_open: 0 },
        reguler_summary: { saldo_open: 0, osla: 0, open_hi: 0, close_hi: 0 },
        reguler_ttr: {
          diamond_vvip: { all: 0, within: 0, over: 0 },
          platinum: { all: 0, within: 0, over: 0 },
          manja: { all: 0, within: 0, over: 0 },
          reguler: { all: 0, within: 0, over: 0 },
        },
        sqm_underspec: { sqm_disruption: 0, sqm_gaul: 0, underspec_disruption: 0, underspec_gaul: 0 },
      };
      continue;
    }

    const workzoneList = workzones.map(wz => `'${wz}'`).join(',');

    const openTickets = await prisma.$queryRawUnsafe<
      Array<{
        id_ticket: number;
        incident: string;
        service_no: string | null;
        customer_name: string | null;
        workzone: string | null;
        jenis_tiket_2: string | null;
        customer_type: string | null;
        flagging_manja: string | null;
        reported_date_dt: Date | null;
        booking_date: string | null;
        status: string | null;
        status_update: string | null;
      }>
    >(`SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.customer_type, t.flagging_manja, t.reported_date_dt, t.booking_date, t.status, t.status_update FROM ticket t WHERE t.workzone IN (${workzoneList}) AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED'))`);

    let regulerOpen = 0;
    let sqmOpen = 0;
    let underspecOpen = 0;
    let oslaCount = 0;

    const ttrBuckets = {
      diamond_vvip: { all: 0, within: 0, over: 0 },
      platinum: { all: 0, within: 0, over: 0 },
      manja: { all: 0, within: 0, over: 0 },
      reguler: { all: 0, within: 0, over: 0 },
    };

    for (const t of openTickets) {
      const jenis = (t.jenis_tiket_2 || '').toUpperCase().trim();
      if (jenis === 'REG' || jenis === 'REGULER') regulerOpen++;
      else if (jenis === 'SQM') sqmOpen++;
      else if (jenis === 'UNSPEC' || jenis === 'UNDERSPEC') underspecOpen++;

      const resolved = resolveTtrBucket({
        jenis_tiket_2: t.jenis_tiket_2,
        customer_type: t.customer_type,
        flagging_manja: t.flagging_manja,
        reported_date_dt: t.reported_date_dt,
        booking_date: t.booking_date,
      }, now);

      if (resolved.bucket) {
        ttrBuckets[resolved.bucket as keyof typeof ttrBuckets].all += 1;
        if (resolved.ttr_state === 'over') {
          ttrBuckets[resolved.bucket as keyof typeof ttrBuckets].over += 1;
          oslaCount++;
          totalOverSla++;
        } else {
          ttrBuckets[resolved.bucket as keyof typeof ttrBuckets].within += 1;
        }
      }
    }

    const totalOpen = regulerOpen + sqmOpen + underspecOpen;
    totalSaldoOpen += totalOpen;

    const hiResult = await prisma.$queryRawUnsafe<
      Array<{ open_hi: bigint; close_hi: bigint }>
    >(`SELECT 
        (SELECT COUNT(*) FROM ticket t WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 IN ('REG', 'REGULER') AND t.reported_date_dt >= '${todayStartStr}') AS open_hi,
        (SELECT COUNT(*) FROM ticket t WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 IN ('REG', 'REGULER') AND (t.status IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED') OR t.status_update IN ('close', 'closed', 'CLOSE', 'CLOSED')) AND t.reported_date_dt >= '${todayStartStr}') AS close_hi
      `);

    const openHi = Number(hiResult?.[0]?.open_hi ?? 0);
    const closeHi = Number(hiResult?.[0]?.close_hi ?? 0);

    const sqmUnderspecResult = await prisma.$queryRawUnsafe<
      Array<{ jenis_tiket_2: string; is_disruption: bigint; is_gaul: bigint }>
    >(`SELECT
        t.jenis_tiket_2,
        (SELECT CASE WHEN 
          (SELECT COUNT(*) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') >= 2
          AND
          (SELECT SUM(CASE WHEN h.jenis_tiket_2 IN ('REG', 'HVC') THEN 1 ELSE 0 END) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') = 0
         THEN 1 ELSE 0 END) AS is_disruption,
        (SELECT CASE WHEN
          EXISTS (SELECT 1 FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= DATE_SUB(t.reported_date_dt, INTERVAL 30 DAY) AND h.reported_date_dt <= t.reported_date_dt AND h.jenis_tiket_2 IN ('REG', 'HVC'))
         THEN 1 ELSE 0 END) AS is_gaul
       FROM ticket t
       WHERE t.workzone IN (${workzoneList})
         AND t.jenis_tiket_2 IN ('SQM', 'UNSPEC', 'UNDERSPEC')
         AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED'))
         AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED'))
         AND t.service_no IS NOT NULL AND TRIM(t.service_no) <> '' AND t.service_no NOT LIKE 'NN%' AND t.service_no NOT LIKE 'DEFAULT-%' AND t.service_no NOT LIKE 'DUMMY%'
      `);

    let sqmDis = 0, sqmGaul = 0, underDis = 0, underGaul = 0;
    for (const row of sqmUnderspecResult) {
      const j = (row.jenis_tiket_2 || '').toUpperCase().trim();
      const dis = Number(row.is_disruption) === 1;
      const gaul = Number(row.is_gaul) === 1;
      if (j === 'SQM') {
        if (dis) sqmDis++;
        if (gaul) sqmGaul++;
      } else if (j === 'UNSPEC' || j === 'UNDERSPEC') {
        if (dis) underDis++;
        if (gaul) underGaul++;
      }
    }

    branchesResult[b.code] = {
      code: b.code,
      name: b.name,
      card: {
        reguler_open: regulerOpen,
        sqm_open: sqmOpen,
        underspec_open: underspecOpen,
        total_open: totalOpen,
      },
      reguler_summary: {
        saldo_open: regulerOpen,
        osla: oslaCount,
        open_hi: openHi,
        close_hi: closeHi,
      },
      reguler_ttr: ttrBuckets,
      sqm_underspec: {
        sqm_disruption: sqmDis,
        sqm_gaul: sqmGaul,
        underspec_disruption: underDis,
        underspec_gaul: underGaul,
      },
    };
  }

  return {
    last_update: now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\./g, ':'),
    total_saldo_open: totalSaldoOpen,
    total_over_sla: totalOverSla,
    branches: branchesResult as any,
  };
}
