export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

type AdminSaRow = { sa_id: number | null };
type TechSaRow = { user_id: number | null; service_area: { nama_sa: string | null } | null };
type TechIdRow = { user_id: number | null } | { id_user: number };
type Technician = { id_user: number; nama: string | null; nik: string | null };
type ClosedCountRow = { teknisi_user_id: number | null; _count: number };

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
): Record<string, unknown> | undefined {
  const filters: Record<string, unknown>[] = [];
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

    // Technician universe
    const adminSaRows = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
    }) as unknown as AdminSaRow[];
    const adminSaIds = adminSaRows
      .map((r: AdminSaRow) => r.sa_id)
      .filter((v: number | null): v is number => v != null);

    const technicianRoleId = 4;
    const technicianIds =
      adminSaIds.length > 0
        ? await prisma.user_sa
            .findMany({
              where: { sa_id: { in: adminSaIds } },
              select: { user_id: true },
            })
            .then((rows: TechIdRow[]) => [
              ...new Set(
                rows
                  .map((r: TechIdRow) => (r as { user_id: number | null }).user_id)
                  .filter((v: number | null): v is number => v != null),
              ),
            ])
        : await prisma.users
            .findMany({
              where: { role_id: technicianRoleId },
              select: { id_user: true },
            })
            .then((rows: TechIdRow[]) =>
              rows.map((r: TechIdRow) => (r as { id_user: number }).id_user),
            );

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
    }) as unknown as TechSaRow[];
    const techWorkzones = new Map<number, string[]>();
    for (const usa of techSa) {
      if (!usa.user_id || !usa.service_area?.nama_sa) continue;
      const existing = techWorkzones.get(usa.user_id) || [];
      existing.push(usa.service_area.nama_sa);
      techWorkzones.set(usa.user_id, existing);
    }

    const selectedWz = selectedWorkzone?.trim().toLowerCase();
    const finalTechnicianIds = selectedWz
      ? technicianIds.filter((id: number) => {
          const wzs = techWorkzones.get(id) || [];
          return wzs.some((wz: string) =>
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
    }) as unknown as Technician[];

    // Closed counts from ticket table
    const closedWhere = {
      teknisi_user_id: { in: finalTechnicianIds },
      STATUS_UPDATE: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
      closed_at: { gte: start, lt: end },
      ...(wzFilter ? wzFilter : {}),
    };

    const closedCounts = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: closedWhere,
      _count: true,
    }) as unknown as ClosedCountRow[];
    const closedCountMap = new Map<number, number>();
    for (const row of closedCounts) {
      if (row.teknisi_user_id)
        closedCountMap.set(row.teknisi_user_id, row._count);
    }

    // Avg resolve hours (tracking) via raw SQL join to apply workzone filter
    const Prisma: any = (await import('@prisma/client')).Prisma;

    const wzConditions: any[] = [];
    if (selectedWorkzone) {
      wzConditions.push(Prisma.sql`t.WORKZONE LIKE ${`%${selectedWorkzone}%`}`);
    }
    if (userWorkzones.length > 0) {
      const wzList = userWorkzones.filter((wz: string) => wz && wz.trim() !== '');
      if (wzList.length > 0) {
        const orClauses: any[] = wzList.map(
          (wz: string) => Prisma.sql`t.WORKZONE LIKE ${`%${wz}%`}`,
        );
        wzConditions.push(
          Prisma.sql`(${Prisma.join(orClauses, Prisma.sql` OR `)})`,
        );
      }
    }
    const wzSql = wzConditions.length > 0
      ? Prisma.sql`AND ${Prisma.join(wzConditions, Prisma.sql` AND `)}`
      : Prisma.empty !== undefined
        ? Prisma.empty
        : Prisma.sql``;

    const avgRows = await prisma.$queryRaw(
      Prisma.sql`
      SELECT tt.assigned_to as tech_id,
             AVG(TIMESTAMPDIFF(SECOND, tt.assigned_at, tt.closed_at)) / 3600 as avg_hours,
             COUNT(*) as n
      FROM ticket_tracking tt
      JOIN ticket t ON t.id_ticket = tt.ticket_id
      WHERE tt.assigned_at IS NOT NULL
        AND tt.closed_at IS NOT NULL
        AND tt.closed_at >= ${start}
        AND tt.closed_at < ${end}
        AND t.STATUS_UPDATE IS NOT NULL
        AND LOWER(t.STATUS_UPDATE) IN ('close','closed')
        AND t.teknisi_user_id = tt.assigned_to
        AND t.teknisi_user_id IN (${Prisma.join(finalTechnicianIds)})
        ${wzSql}
      GROUP BY tt.assigned_to
    `,
    ) as unknown as Array<{ tech_id: number; avg_hours: number | null; n: number }>;

    const avgMap = new Map<number, number>();
    for (const r of avgRows) {
      if (r.tech_id) avgMap.set(r.tech_id, Number(r.avg_hours || 0));
    }

    const rows = technicians
      .map((t: Technician) => {
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
