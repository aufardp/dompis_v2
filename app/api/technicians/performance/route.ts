export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, end };
}

function buildWorkzoneTicketFilter(
  workzones: string[],
  selected?: string,
): Prisma.ticketWhereInput | undefined {
  const filters: Prisma.ticketWhereInput[] = [];
  const wz = selected?.trim();
  if (wz) {
    filters.push({ WORKZONE: { contains: wz } });
  }
  if (workzones.length > 0) {
    filters.push({ OR: workzones.map((w) => ({ WORKZONE: { contains: w } })) });
  }
  if (filters.length === 0) return undefined;
  return { AND: filters };
}

export async function GET(req: NextRequest) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);
    if (!isAdminRole(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const month = toInt(searchParams.get('month'), 0);
    const year = toInt(searchParams.get('year'), 0);
    const selectedWorkzone = searchParams.get('workzone') || undefined;

    if (!month || month < 1 || month > 12 || !year || year < 2000) {
      return NextResponse.json(
        { success: false, message: 'Invalid month/year' },
        { status: 400 },
      );
    }

    const { start, end } = monthRange(year, month);

    const userWorkzones = (await getWorkzonesForUser(user.id_user)).filter(
      (w) => w && w.trim() !== '',
    );
    const wzFilter = buildWorkzoneTicketFilter(userWorkzones, selectedWorkzone);

    // Technician universe: technicians in the same service areas as admin (or all if admin has no SA mapping)
    const adminSaRows = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
    });
    const adminSaIds = adminSaRows
      .map((r) => r.sa_id)
      .filter((v): v is number => v != null);

    const technicianRoleId = 4;
    const technicianIds =
      adminSaIds.length > 0
        ? await prisma.user_sa
            .findMany({
              where: { sa_id: { in: adminSaIds } },
              select: { user_id: true },
            })
            .then((rows) => [
              ...new Set(
                rows
                  .map((r) => r.user_id)
                  .filter((v): v is number => v != null),
              ),
            ])
        : await prisma.users
            .findMany({
              where: { role_id: technicianRoleId },
              select: { id_user: true },
            })
            .then((rows) => rows.map((r) => r.id_user));

    if (technicianIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          month,
          year,
          workzone: selectedWorkzone || null,
          userWorkzones,
          rows: [],
        },
      });
    }

    // Workzones per technician
    const techSa = await prisma.user_sa.findMany({
      where: { user_id: { in: technicianIds } },
      include: { service_area: { select: { nama_sa: true } } },
    });
    const techWorkzones = new Map<number, string[]>();
    for (const usa of techSa) {
      if (!usa.user_id || !usa.service_area?.nama_sa) continue;
      const existing = techWorkzones.get(usa.user_id) || [];
      existing.push(usa.service_area.nama_sa);
      techWorkzones.set(usa.user_id, existing);
    }

    const selectedWz = selectedWorkzone?.trim().toLowerCase();
    const finalTechnicianIds = selectedWz
      ? technicianIds.filter((id) => {
          const wzs = techWorkzones.get(id) || [];
          return wzs.some((wz) =>
            String(wz || '')
              .toLowerCase()
              .includes(selectedWz),
          );
        })
      : technicianIds;

    if (finalTechnicianIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          month,
          year,
          workzone: selectedWorkzone || null,
          userWorkzones,
          rows: [],
        },
      });
    }

    const technicians = await prisma.users.findMany({
      where: {
        id_user: { in: finalTechnicianIds },
        role_id: technicianRoleId,
      },
      select: { id_user: true, nama: true, nik: true },
      orderBy: { nama: 'asc' },
    });

    // Closed counts from ticket table
    const closedWhere: Prisma.ticketWhereInput = {
      teknisi_user_id: { in: finalTechnicianIds },
      STATUS_UPDATE: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
      closed_at: { gte: start, lt: end },
      ...(wzFilter ? wzFilter : {}),
    };

    const closedCounts = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: closedWhere,
      _count: true,
    });
    const closedCountMap = new Map<number, number>();
    for (const row of closedCounts) {
      if (row.teknisi_user_id)
        closedCountMap.set(row.teknisi_user_id, row._count);
    }

    // Avg resolve hours (tracking) via raw SQL join to apply workzone filter
    let wzSql = Prisma.empty;
    if (selectedWorkzone) {
      wzSql = Prisma.sql`${wzSql} AND t.WORKZONE LIKE ${`%${selectedWorkzone}%`} `;
    }
    if (userWorkzones.length > 0) {
      let orSql = Prisma.empty;
      const wzList = userWorkzones.filter((wz) => wz && wz.trim() !== '');
      wzList.forEach((wz, idx) => {
        const clause = Prisma.sql`t.WORKZONE LIKE ${`%${wz}%`}`;
        orSql = idx === 0 ? clause : Prisma.sql`${orSql} OR ${clause}`;
      });
      if (wzList.length > 0) {
        wzSql = Prisma.sql`${wzSql} AND (${orSql}) `;
      }
    }

    const avgRows = await prisma.$queryRaw<
      Array<{ tech_id: number; avg_hours: number | null; n: number }>
    >(Prisma.sql`
      SELECT tt.assigned_to as tech_id,
             AVG(TIMESTAMPDIFF(SECOND, tt.assigned_at, tt.closed_at)) / 3600 as avg_hours,
             COUNT(*) as n
      FROM ticket_tracking tt
      JOIN ticket t ON t.id_ticket = tt.ticket_id
      WHERE tt.assigned_at IS NOT NULL
        AND tt.closed_at IS NOT NULL
        AND tt.closed_at >= ${start}
        AND tt.closed_at < ${end}
        AND t.STATUS_UPDATE = {in:['close','closed','CLOSE','CLOSED']}
        AND t.teknisi_user_id = tt.assigned_to
        AND t.teknisi_user_id IN (${Prisma.join(finalTechnicianIds)})
        ${wzSql}
      GROUP BY tt.assigned_to
    `);

    const avgMap = new Map<number, number>();
    for (const r of avgRows) {
      if (r.tech_id) avgMap.set(r.tech_id, Number(r.avg_hours || 0));
    }

    const rows = technicians
      .map((t) => {
        const wzs = techWorkzones.get(t.id_user) || [];
        return {
          id_user: t.id_user,
          nama: t.nama ?? '',
          nik: t.nik,
          workzone: wzs.length > 0 ? wzs.join(', ') : 'Unknown',
          closed_count: closedCountMap.get(t.id_user) || 0,
          avg_resolve_time_hours: avgMap.get(t.id_user) ?? null,
        };
      })
      .sort((a, b) => {
        if (b.closed_count !== a.closed_count)
          return b.closed_count - a.closed_count;
        const aName = String((a as any).nama ?? '');
        const bName = String((b as any).nama ?? '');
        return aName.localeCompare(bName);
      });

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        workzone: selectedWorkzone || null,
        userWorkzones,
        rows,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to load performance');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
