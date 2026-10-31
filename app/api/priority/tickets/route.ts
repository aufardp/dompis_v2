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
      // Open HI / Close HI for today (WIB)
      if (subKind === 'open_hi' || subKind === 'close_hi') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartStr = todayStart.toISOString().slice(0, 19).replace('T', ' ');
        const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

        let whereClause = `WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 IN ('REG', 'REGULER') AND t.reported_date_dt >= '${todayStartStr}' AND t.reported_date_dt <= '${nowStr}'`;

        if (subKind === 'open_hi') {
          whereClause += ` AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED'))`;
        } else if (subKind === 'close_hi') {
          whereClause += ` AND (t.status IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED') OR t.status_update IN ('close', 'closed', 'CLOSE', 'CLOSED'))`;
        }

        const result = await prisma.$queryRawUnsafe<any[]>(
          `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.status, t.reported_date_dt, t.resolve_date FROM ticket t ${whereClause}`
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
            resolve_date: t.resolve_date,
            evidence: { kind: subKind },
            kind: 'hi',
          });
        }
      } else {
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
      }
    } else if (kind === 'sqm') {
      let whereClause = `WHERE t.workzone IN (${workzoneList}) AND t.jenis_tiket_2 = 'SQM' AND (t.status IS NULL OR t.status NOT IN ('CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED')) AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed', 'CLOSE', 'CLOSED')) AND t.service_no IS NOT NULL AND TRIM(t.service_no) <> '' AND t.service_no NOT LIKE 'NN%' AND t.service_no NOT LIKE 'DEFAULT-%' AND t.service_no NOT LIKE 'DUMMY%'`;

      if (subKind === 'disruption') {
        whereClause += ` AND (SELECT COUNT(*) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') >= 2`;
        whereClause += ` AND (SELECT SUM(CASE WHEN h.jenis_tiket_2 IN ('REG', 'HVC') THEN 1 ELSE 0 END) FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= '${windowStartStr}' AND h.reported_date_dt <= '${nowStr}') = 0`;
      } else if (subKind === 'gaul') {
        whereClause += ` AND EXISTS (SELECT 1 FROM ticket h WHERE h.service_no = t.service_no AND h.reported_date_dt >= DATE_SUB(t.reported_date_dt, INTERVAL 30 DAY) AND h.reported_date_dt <= t.reported_date_dt AND h.jenis_tiket_2 IN ('REG', 'HVC'))`;
      }

      const result = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.status, t.reported_date_dt, t.resolve_date FROM ticket t ${whereClause}`
      );

      if (subKind === 'gaul' && result.length > 0) {
        const serviceNos = Array.from(new Set(result.map((r) => r.service_no).filter(Boolean)));
        if (serviceNos.length > 0) {
          const serviceNosIn = serviceNos.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',');
          const historyList = await prisma.$queryRawUnsafe<any[]>(
            `SELECT h.id_ticket, h.incident, h.service_no, h.customer_name, h.workzone, h.jenis_tiket_2, h.customer_type, h.flagging_manja, h.reported_date_dt, h.booking_date, h.status, h.status_update
             FROM ticket h
             WHERE h.service_no IN (${serviceNosIn})
               AND h.jenis_tiket_2 IN ('REG', 'HVC')
               AND h.reported_date_dt >= DATE_SUB(NOW(), INTERVAL 60 DAY)
             ORDER BY h.reported_date_dt ASC`
          );

          const historyByService: Record<string, any[]> = {};
          for (const h of historyList) {
            const key = h.service_no;
            if (!historyByService[key]) historyByService[key] = [];
            historyByService[key].push(h);
          }

          for (const t of result) {
            const related = (historyByService[t.service_no] || []).filter((h: any) => {
              const hDate = new Date(h.reported_date_dt);
              const tDate = new Date(t.reported_date_dt);
              if (isNaN(hDate.getTime()) || isNaN(tDate.getTime())) return false;
              const diffMs = tDate.getTime() - hDate.getTime();
              if (diffMs < 0) return false;
              if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
              return true;
            });

            for (const h of related) {
              tickets.push({
                id_ticket: h.id_ticket,
                incident: h.incident,
                service_no: h.service_no,
                customer_name: h.customer_name,
                workzone: h.workzone,
                jenis_tiket_2: h.jenis_tiket_2,
                customer_type: h.customer_type,
                flagging_manja: h.flagging_manja,
                booking_date: h.booking_date,
                status: h.status,
                reported_date_dt: h.reported_date_dt,
                resolve_date: h.resolve_date,
                evidence: {
                  kind: 'gaul',
                  gaul_relation: 'history',
                  related_to_incident: t.incident,
                  related_to_service_no: t.service_no,
                },
                kind: 'gaul_history',
              });
            }

            tickets.push({
              id_ticket: t.id_ticket,
              incident: t.incident,
              service_no: t.service_no,
              customer_name: t.customer_name,
              workzone: t.workzone,
              jenis_tiket_2: t.jenis_tiket_2,
              status: t.status,
              reported_date_dt: t.reported_date_dt,
              resolve_date: t.resolve_date,
              evidence: { kind: subKind || 'gaul', gaul_relation: 'current' },
              kind: 'disruption',
            });
          }
          // Sort by related incident then by date
          tickets.sort((a, b) => {
            const aRel = a.evidence?.related_to_incident || a.incident;
            const bRel = b.evidence?.related_to_incident || b.incident;
            if (aRel !== bRel) return aRel.localeCompare(bRel);
            const ad = new Date(a.reported_date_dt).getTime();
            const bd = new Date(b.reported_date_dt).getTime();
            return ad - bd;
          });
        }
      } else {
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
            resolve_date: t.resolve_date,
            evidence: { kind: subKind || 'disruption' },
            kind: 'disruption',
          });
        }
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
        `SELECT t.id_ticket, t.incident, t.service_no, t.customer_name, t.workzone, t.jenis_tiket_2, t.status, t.reported_date_dt, t.resolve_date FROM ticket t ${whereClause}`
      );

      if (subKind === 'gaul' || subKind === 'disruption') {
        const serviceNos = Array.from(new Set(result.map((r) => r.service_no).filter(Boolean)));
        if (serviceNos.length > 0) {
          const serviceNosIn = serviceNos.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',');
          const historyList = await prisma.$queryRawUnsafe<any[]>(
            `SELECT h.id_ticket, h.incident, h.service_no, h.customer_name, h.workzone, h.jenis_tiket_2, h.customer_type, h.flagging_manja, h.reported_date_dt, h.booking_date, h.status, h.status_update
             FROM ticket h
             WHERE h.service_no IN (${serviceNosIn})
               AND h.reported_date_dt >= DATE_SUB(NOW(), INTERVAL 60 DAY)
             ORDER BY h.reported_date_dt ASC`
          );

          const historyByService: Record<string, any[]> = {};
          for (const h of historyList) {
            const key = h.service_no;
            if (!historyByService[key]) historyByService[key] = [];
            historyByService[key].push(h);
          }

          for (const t of result) {
            const related = (historyByService[t.service_no] || []).filter((h: any) => {
              const hDate = new Date(h.reported_date_dt);
              const tDate = new Date(t.reported_date_dt);
              if (isNaN(hDate.getTime()) || isNaN(tDate.getTime())) return false;
              const diffMs = tDate.getTime() - hDate.getTime();
              if (diffMs < 0) return false;
              if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
              if (h.incident === t.incident) return false; // skip self
              return true;
            });

            for (const h of related) {
              tickets.push({
                id_ticket: h.id_ticket,
                incident: h.incident,
                service_no: h.service_no,
                customer_name: h.customer_name,
                workzone: h.workzone,
                jenis_tiket_2: h.jenis_tiket_2,
                customer_type: h.customer_type,
                flagging_manja: h.flagging_manja,
                booking_date: h.booking_date,
                status: h.status,
                reported_date_dt: h.reported_date_dt,
                resolve_date: h.resolve_date,
                evidence: {
                  kind: subKind,
                  gaul_relation: 'history',
                  related_to_incident: t.incident,
                  related_to_service_no: t.service_no,
                },
                kind: 'gaul_history',
              });
            }

            tickets.push({
              id_ticket: t.id_ticket,
              incident: t.incident,
              service_no: t.service_no,
              customer_name: t.customer_name,
              workzone: t.workzone,
              jenis_tiket_2: t.jenis_tiket_2,
              status: t.status,
              reported_date_dt: t.reported_date_dt,
              resolve_date: t.resolve_date,
              evidence: { kind: subKind || 'disruption', gaul_relation: 'current' },
              kind: 'disruption',
            });
          }
          tickets.sort((a, b) => {
            const aRel = a.evidence?.related_to_incident || a.incident;
            const bRel = b.evidence?.related_to_incident || b.incident;
            if (aRel !== bRel) return aRel.localeCompare(bRel);
            const ad = new Date(a.reported_date_dt).getTime();
            const bd = new Date(b.reported_date_dt).getTime();
            return ad - bd;
          });
        }
      } else {
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
            resolve_date: t.resolve_date,
            evidence: { kind: subKind || 'disruption' },
            kind: 'disruption',
          });
        }
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