// app/api/priority/tickets/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import prisma from '@/app/libs/prisma';
import { PriorityBranchCode } from '@/app/libs/priority/types';
import { getBranchServiceAreaNames } from '@/app/helpers/ticket.helpers';
import { resolveTtrBucket } from '@/app/libs/priority/ttr';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'priority-tickets',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'admin_branch', 'senior_leader']);

    const branchParam = request.nextUrl.searchParams.get('branch');
    const kind = String(request.nextUrl.searchParams.get('kind') ?? '').trim();
    const subKind = String(request.nextUrl.searchParams.get('subKind') ?? '').trim();
    const bucketParam = request.nextUrl.searchParams.get('bucket');
    const bucket = bucketParam ? String(bucketParam).trim() : undefined;
    const stateParam = request.nextUrl.searchParams.get('state');
    const state = String(stateParam ?? 'all').trim();
    const q = String(request.nextUrl.searchParams.get('q') ?? '').trim().substring(0, 100);
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '20') || 20));

    if (!kind || !['reguler', 'sqm', 'underspec'].includes(kind)) {
      return NextResponse.json(
        { success: false, message: 'Parameter kind tidak valid.' },
        { status: 400 },
      );
    }

    let branchCode: string | null = null;
    if (branchParam) {
      branchCode = String(branchParam).trim().toUpperCase();
      const validCodes = ['PKL', 'DPS', 'MTR', 'KPG', 'FLO'];
      if (!validCodes.includes(branchCode)) {
        return NextResponse.json(
          { success: false, message: 'Kode branch tidak valid.' },
          { status: 400 },
        );
      }
    }

    const validStates = ['within', 'near', 'over', 'all'];
    if (!validStates.includes(state)) {
      return NextResponse.json(
        { success: false, message: 'Parameter state tidak valid.' },
        { status: 400 },
      );
    }

    const branchId = branchCode === 'PKL' ? 10 : branchCode === 'DPS' ? 1 : branchCode === 'MTR' ? 9 : branchCode === 'KPG' ? 4 : 2;
    const workzones = await getBranchServiceAreaNames(branchId);
    if (!workzones.length) {
      return NextResponse.json({
        success: true,
        data: { meta: { branch: branchCode ?? 'PKL', kind, bucket, state, q, page, limit, total: 0, has_more: false, counts: undefined }, rows: [] },
      });
    }

    const workzoneList = workzones.map(wz => `'${wz}'`).join(',');
    const now = new Date();
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowStartStr = windowStart.toISOString().slice(0, 19).replace('T', ' ');
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

    // Build base query for open tickets in branch workzones
    const baseWhere = `WHERE t.workzone IN (${workzoneList}) AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED'))`;

    let tickets: any[] = [];

    if (kind === 'reguler') {
      // Reguler tickets with TTR bucket/state filter
      const result = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.customer_type, t.flagging_manja, t.reported_date_dt, t.booking_date, t.status, t.status_update FROM ticket t ${baseWhere} AND t.jenis_tiket_2 IN ('REG', 'REGULER')`
      );

      for (const t of result) {
        const resolved = resolveTtrBucket({
          jenis_tiket_2: t.jenis_tiket_2,
          customer_type: t.customer_type,
          flagging_manja: t.flagging_manja,
          reported_date_dt: t.reported_date_dt,
          booking_date: t.booking_date,
        }, now);

        if (resolved.bucket) {
          if (bucket && resolved.bucket !== bucket) continue;
          if (state !== 'all' && resolved.ttr_state !== state) continue;

          tickets.push({
            id_ticket: t.id_ticket,
            incident: t.incident,
            service_no: t.service_no,
            customer_name: t.customer_name,
            workzone: t.workzone,
            jenis_tiket_2: t.jenis_tiket_2,
            customer_type: t.customer_type,
            flagging_manja: t.flagging_manja,
            booking_date: t.booking_date,
            status: t.status,
            reported_date_dt: t.reported_date_dt,
            evidence: {
              bucket: resolved.bucket,
              customer_type: t.customer_type,
              flagging_manja: t.flagging_manja,
              deadline_at: resolved.deadline_at,
              remaining_ms: resolved.remaining_ms,
              ttr_state: resolved.ttr_state,
              ttr_state_label: {
                'within': 'Kritis',
                'near': 'Hampir Tercapai',
                'over': 'Terlewat',
              }[resolved.ttr_state] || resolved.ttr_state,
              manja_deadline_info: resolved.bucket === 'manja' 
                ? (t.booking_date ? t.booking_date : t.reported_date_dt) 
                : null,
              max_ttr_deadline: resolved.deadline_at,
            },
            kind: 'ttr',
          });
        }
      }
    } else if (kind === 'sqm') {
      // SQM tickets - disruption or gaul
      let whereClause = `WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 = 'SQM' AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED')) AND t.service_no IS NOT NULL AND TRIM(t.service_no) <> '' AND t.service_no NOT LIKE 'NN%' AND t.service_no NOT LIKE 'DEFAULT-%' AND t.service_no NOT LIKE 'DUMMY%'`;

      if (subKind === 'disruption') {
        // Disruption: >=2 tickets in 30d, 0 REG/HVC in 30d
        whereClause += ` AND (SELECT COUNT(*) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') >= 2`;
        whereClause += ` AND (SELECT SUM(CASE WHEN h.jenis_tiket_2 IN ('REG', 'HVC') THEN 1 ELSE 0 END) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') = 0`;
      } else if (subKind === 'gaul') {
        // Gaul: REG/HVC exists in 30d before reported_date_dt
        whereClause += ` AND EXISTS (SELECT 1 FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= DATE_SUB(t.reported_date_dt, INTERVAL 30 DAY) AND h.reported_date_dt <= t.reported_date_dt AND h.jenis_tiket_2 IN ('REG', 'HVC'))`;
      }

      const result = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.status, t.reported_date_dt FROM ticket t ${whereClause}`
      );

      for (const t of result) {
        tickets.push({
          id_ticket: t.id_ticket,
          incident: t.incident,
          service_no: t.service_no,
          customer_name: t.customer_name,
          workzone: t.workzone,
          jenis_tiket_2: t.jenis_tiket_2,
          status: t.status,
          reported_date_dt: t.reported_date_dt,
          evidence: { kind: subKind || 'disruption' },
          kind: 'disruption',
        });
      }
    } else if (kind === 'underspec') {
      // Underspec/UNSPEC tickets - disruption or gaul
      let whereClause = `WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 IN ('UNSPEC', 'UNDERSPEC') AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED')) AND t.service_no IS NOT NULL AND TRIM(t.service_no) <> '' AND t.service_no NOT LIKE 'NN%' AND t.service_no NOT LIKE 'DEFAULT-%' AND t.service_no NOT LIKE 'DUMMY%'`;

      if (subKind === 'disruption') {
        whereClause += ` AND (SELECT COUNT(*) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') >= 2`;
        whereClause += ` AND (SELECT SUM(CASE WHEN h.jenis_tiket_2 IN ('REG', 'HVC') THEN 1 ELSE 0 END) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') = 0`;
      } else if (subKind === 'gaul') {
        whereClause += ` AND EXISTS (SELECT 1 FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= DATE_SUB(t.reported_date_dt, INTERVAL 30 DAY) AND h.reported_date_dt <= t.reported_date_dt AND h.jenis_tiket_2 IN ('REG', 'HVC'))`;
      }

      const result = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.status, t.reported_date_dt FROM ticket t ${whereClause}`
      );

      for (const t of result) {
        tickets.push({
          id_ticket: t.id_ticket,
          incident: t.incident,
          service_no: t.service_no,
          customer_name: t.customer_name,
          workzone: t.workzone,
          jenis_tiket_2: t.jenis_tiket_2,
          status: t.status,
          reported_date_dt: t.reported_date_dt,
          evidence: { kind: subKind || 'disruption' },
          kind: 'disruption',
        });
      }
    }

    // Search filter
    if (q) {
      const searchLower = q.toLowerCase();
      tickets = tickets.filter(
        (row) =>
          row.incident.toLowerCase().includes(searchLower) ||
          row.service_no?.toLowerCase().includes(searchLower) ||
          (row.customer_name && row.customer_name.toLowerCase().includes(searchLower)),
      );
    }

    const total = tickets.length;
    const hasMore = total > page * limit;
    const startIdx = (page - 1) * limit;
    const endIdx = page * limit;
    const rowsPage = tickets.slice(startIdx, endIdx);

    const branchNames: Record<string, string> = {
      PKL: 'PEKALONGAN', DPS: 'DENPASAR', MTR: 'MATARAM', KPG: 'KUPANG', FLO: 'FLORES',
    };

    let counts: any = undefined;
    if (kind === 'reguler') {
      counts = {
        all: tickets.length,
        within: tickets.filter(r => r.evidence.ttr_state === 'within').length,
        near: tickets.filter(r => r.evidence.ttr_state === 'near').length,
        over: tickets.filter(r => r.evidence.ttr_state === 'over').length,
      };
    }

    const meta = {
      branch: branchCode ?? 'PKL',
      branch_name: branchNames[branchCode ?? 'PKL'] || 'Semua Branch',
      kind,
      subKind: kind !== 'reguler' ? subKind : undefined,
      bucket: kind === 'reguler' ? bucket : undefined,
      state: kind === 'reguler' ? state : undefined,
      q: q || null,
      page,
      limit,
      total,
      has_more: hasMore,
      counts,
    };

    return NextResponse.json({
      success: true,
      data: { meta, rows: rowsPage },
    });
  } catch (error: unknown) {
    console.error('Priority tickets error:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat data tiket priority.' },
      { status: 500 },
    );
  }
}