export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function escapeCsvCell(v: unknown) {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, end };
}

function buildWorkzoneTicketFilter(workzones: string[], selected?: string) {
  const filters: any[] = [];
  const wz = selected?.trim();
  if (wz) filters.push({ WORKZONE: { contains: wz } });
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
    const type = (searchParams.get('type') || 'summary').toLowerCase();

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

    if (type === 'tickets') {
      const where: any = {
        STATUS_UPDATE: { in: ['closed', 'close', 'CLOSE', 'CLOSED'] },
        closed_at: { gte: start, lt: end },
        ...(wzFilter ? wzFilter : {}),
      };

      const rows = await prisma.ticket.findMany({
        where,
        include: { users: { select: { nama: true, nik: true } } },
        orderBy: { closed_at: 'desc' },
      });

      const headers = [
        'TicketID',
        'INCIDENT',
        'SERVICE_NO',
        'CONTACT_NAME',
        'CUSTOMER_TYPE',
        'WORKZONE',
        'STATUS_UPDATE',
        'CLOSED_AT',
        'TEKNISI_NAME',
        'TEKNISI_NIK',
      ];

      const csv = [
        headers.join(','),
        ...rows.map((t) =>
          [
            t.id_ticket,
            t.INCIDENT,
            t.SERVICE_NO,
            t.CONTACT_NAME,
            t.CUSTOMER_TYPE,
            t.WORKZONE,
            t.closed_at ? t.closed_at.toISOString() : '',
            t.users?.nama,
            t.users?.nik,
          ]
            .map(escapeCsvCell)
            .join(','),
        ),
      ].join('\n');

      const filename = `technicians_closed_tickets_${year}-${String(month).padStart(2, '0')}.csv`;
      return new NextResponse('\ufeff' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // summary
    const technicianRoleId = 4;
    const adminSaRows = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
    });
    const adminSaIds = adminSaRows
      .map((r) => r.sa_id)
      .filter((v): v is number => v != null);

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

    const technicians = await prisma.users.findMany({
      where: { id_user: { in: technicianIds }, role_id: technicianRoleId },
      select: { id_user: true, nama: true, nik: true },
      orderBy: { nama: 'asc' },
    });

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
    const filteredTechnicians = selectedWz
      ? technicians.filter((t) => {
          const wzs = techWorkzones.get(t.id_user) || [];
          return wzs.some((wz) =>
            String(wz || '')
              .toLowerCase()
              .includes(selectedWz),
          );
        })
      : technicians;

    const finalTechIds = filteredTechnicians.map((t) => t.id_user);

    const closedCounts = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: finalTechIds },
        STATUS_UPDATE: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
        closed_at: { gte: start, lt: end },
        ...(wzFilter ? wzFilter : {}),
      },
      _count: true,
    });
    const closedCountMap = new Map<number, number>();
    for (const row of closedCounts) {
      if (row.teknisi_user_id)
        closedCountMap.set(row.teknisi_user_id, row._count);
    }

    const headers = ['Nama', 'NIK', 'Workzone', 'Closed Count (Month)'];
    const csv = [
      headers.join(','),
      ...filteredTechnicians.map((t) => {
        const wzs = techWorkzones.get(t.id_user) || [];
        return [
          t.nama,
          t.nik || '',
          wzs.length > 0 ? wzs.join(', ') : 'Unknown',
          closedCountMap.get(t.id_user) || 0,
        ]
          .map(escapeCsvCell)
          .join(',');
      }),
    ].join('\n');

    const filename = `technicians_summary_${year}-${String(month).padStart(2, '0')}.csv`;
    return new NextResponse('\ufeff' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to export');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
