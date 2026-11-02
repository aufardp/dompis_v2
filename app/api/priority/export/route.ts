// app/api/priority/export/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { PriorityBranchCode } from '@/app/libs/priority/types';
import { queryAllPrioritySummary, queryPriorityTickets } from '@/app/libs/priority/queries';
import { parsePrioritySelection } from '@/app/libs/priority/selection';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { logger } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'priority-export',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'admin_branch', 'senior_leader']);

    const scope = String(request.nextUrl.searchParams.get('scope') ?? '').trim();
    const branchParam = request.nextUrl.searchParams.get('branch');

    if (!['summary', 'tickets'].includes(scope)) {
      return NextResponse.json({ success: false, message: 'Invalid scope' }, { status: 400 });
    }

    if (scope === 'summary') {
      const data = await queryAllPrioritySummary(decoded.id_user, decoded.role);
      const branchCode = branchParam?.toUpperCase();
      const branches = (branchCode && data.branches[branchCode as PriorityBranchCode]) 
        ? { [branchCode]: data.branches[branchCode as PriorityBranchCode] } 
        : data.branches;

      const rows: string[] = ['branch_code,branch_name,total_saldo_open,total_over_sla,ttr_diamond_vvip_all,ttr_diamond_vvip_within,ttr_diamond_vvip_over,ttr_platinum_all,ttr_platinum_within,ttr_platinum_over,ttr_manja_all,ttr_manja_within,ttr_manja_over,ttr_reguler_all,ttr_reguler_within,ttr_reguler_over'];
      let totalOpen = 0, totalOver = 0;
      const sums = { d: { a: 0, w: 0, o: 0 }, p: { a: 0, w: 0, o: 0 }, m: { a: 0, w: 0, o: 0 }, r: { a: 0, w: 0, o: 0 } };

      for (const code of Object.keys(branches)) {
        const br = branches[code as PriorityBranchCode];
        rows.push([br.code, br.name, br.card.total_open, br.reguler_summary.osla, br.reguler_ttr.diamond_vvip.all, br.reguler_ttr.diamond_vvip.within, br.reguler_ttr.diamond_vvip.over, br.reguler_ttr.platinum.all, br.reguler_ttr.platinum.within, br.reguler_ttr.platinum.over, br.reguler_ttr.manja.all, br.reguler_ttr.manja.within, br.reguler_ttr.manja.over, br.reguler_ttr.reguler.all, br.reguler_ttr.reguler.within, br.reguler_ttr.reguler.over].join(','));
        totalOpen += br.card.total_open;
        totalOver += br.reguler_summary.osla;
        sums.d.a += br.reguler_ttr.diamond_vvip.all; sums.d.w += br.reguler_ttr.diamond_vvip.within; sums.d.o += br.reguler_ttr.diamond_vvip.over;
        sums.p.a += br.reguler_ttr.platinum.all; sums.p.w += br.reguler_ttr.platinum.within; sums.p.o += br.reguler_ttr.platinum.over;
        sums.m.a += br.reguler_ttr.manja.all; sums.m.w += br.reguler_ttr.manja.within; sums.m.o += br.reguler_ttr.manja.over;
        sums.r.a += br.reguler_ttr.reguler.all; sums.r.w += br.reguler_ttr.reguler.within; sums.r.o += br.reguler_ttr.reguler.over;
      }
      rows.push(['TOTAL', 'Total', totalOpen, totalOver, sums.d.a, sums.d.w, sums.d.o, sums.p.a, sums.p.w, sums.p.o, sums.m.a, sums.m.w, sums.m.o, sums.r.a, sums.r.w, sums.r.o].join(','));
      return new NextResponse('\uFEFF' + rows.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="priority-summary.csv"' } });
    }

    // scope === 'tickets'
    const { branch: branchCode, selection } = parsePrioritySelection(request.nextUrl.searchParams);
    const tickets = await queryPriorityTickets(branchCode, selection, decoded.id_user, decoded.role);
    
    const rows: string[] = ['incident,service_no,customer_name,reported_date,status'];
    for (const t of tickets) {
      rows.push([t.incident, t.service_no, t.customer_name, t.reported_date_dt, t.status].map(v => `"${v?.toString().replace(/"/g, '""') ?? ''}"`).join(','));
    }
    return new NextResponse('\uFEFF' + rows.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="priority-tickets-${branchCode}.csv"` } });
  } catch (e) {
    logger.error('Export error', e);
    return NextResponse.json({ success: false, message: getErrorMessage(e, 'Gagal mengekspor data priority.') }, { status: getErrorStatus(e, 500) });
  }
}
