export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { getOrSetCache } from '@/lib/cache';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const DIRECT_EXPORT_MAX_ROWS = Number.parseInt(
  process.env.TECH_PERFORMANCE_EXPORT_MAX_ROWS || '10000',
  10,
);
const CACHE_TTL_SECONDS = 30;

function buildCacheKey(
  role: string,
  userId: number,
  month: number,
  year: number,
  workzone: string | undefined,
) {
  return `technicians_performance_export:${role}:${userId}:${year}-${String(month).padStart(2, '0')}:${workzone || 'all'}`;
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
    const month = Number(searchParams.get('month'));
    const year = Number(searchParams.get('year'));
    const selectedWorkzone = searchParams.get('workzone') || undefined;

    if (!month || month < 1 || month > 12 || !year || year < 2000) {
      return NextResponse.json(
        { success: false, message: 'Invalid month/year' },
        { status: 400 },
      );
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);
    const monthLabel = `${MONTHS[month - 1]} ${year}`;

    const userWorkzones = (await getWorkzonesForUser(user.id_user)).filter(
      (w) => w && w.trim(),
    );

    const cacheKey = buildCacheKey(
      user.role,
      user.id_user,
      month,
      year,
      selectedWorkzone,
    );
    const exportData = await getOrSetCache(
      cacheKey,
      async () => {
        // Get admin's service areas to filter teknisi
        const adminSaRows = await prisma.user_sa.findMany({
          take: 50,
          where: { user_id: user.id_user },
          select: { sa_id: true },
        });
        const adminSaIds = adminSaRows
          .map((r: { sa_id: number | null }) => r.sa_id)
          .filter((v: number | null): v is number => v != null);

        // Get teknisi IDs based on admin's service areas
        let teknisiIds: number[] = [];
        if (adminSaIds.length > 0) {
          const techSa = await prisma.user_sa.findMany({
            take: 1000,
            where: { sa_id: { in: adminSaIds } },
            select: { user_id: true },
          });
          teknisiIds = [
            ...new Set(
              techSa
                .map((r: { user_id: number | null }) => r.user_id)
                .filter((v: number | null): v is number => v != null),
            ),
          ];
        } else {
          // Superadmin gets all teknisi
          const allTech = await prisma.users.findMany({
            take: 1000,
            where: { roles: { is: { key: 'teknisi' } } },
            select: { id_user: true },
          });
          teknisiIds = allTech.map((t: { id_user: number }) => t.id_user);
        }

        if (teknisiIds.length === 0) {
          return null;
        }

        // Fetch only filtered teknisi
        const teknisiList = await prisma.users.findMany({
          take: 1000,
          where: { id_user: { in: teknisiIds } },
          select: { id_user: true, nama: true, nik: true },
          orderBy: { nama: 'asc' },
        });

        // Build workzone filter
        const wzFilter: any = {};
        if (selectedWorkzone) {
          wzFilter.workzone = { contains: selectedWorkzone };
        } else if (userWorkzones.length > 0) {
          wzFilter.OR = userWorkzones.map((w) => ({ workzone: { contains: w } }));
        }

        // Fetch all closed tickets for the month
        const allTickets = await prisma.ticket.findMany({
          where: {
            status_update: { in: ['close', 'closed'] },
            closed_at: { gte: start, lt: end },
            teknisi_user_id: { not: null },
            ...wzFilter,
          },
          take: DIRECT_EXPORT_MAX_ROWS + 1,
          select: {
            id_ticket: true,
            incident: true,
            contact_name: true,
            service_no: true,
            customer_type: true,
            jenis_tiket_1: true,
            workzone: true,
            reported_date: true,
            status_update: true,
            closed_at: true,
            teknisi_user_id: true,
            description_solution_dompis: true,
            rca: true,
            sub_rca: true,
          },
          orderBy: [{ teknisi_user_id: 'asc' }, { closed_at: 'asc' }],
        });
        if (allTickets.length > DIRECT_EXPORT_MAX_ROWS) {
          return {
            tooLarge: true as const,
            count: allTickets.length - 1,
          };
        }

        // Build per-technician summary
        const techMap = new Map<number, typeof allTickets>();
        for (const t of allTickets) {
          const techId = t.teknisi_user_id!;
          if (!techMap.has(techId)) techMap.set(techId, []);
          techMap.get(techId)!.push(t);
        }

        // Sheet 1: Summary per teknisi
        const summaryData = teknisiList.map((tech) => {
          const tickets = techMap.get(tech.id_user) || [];
          const avgResolve =
            tickets.reduce((sum, t) => {
              if (!t.reported_date || !t.closed_at) return sum;
              const reported = new Date(t.reported_date);
              const closed = new Date(t.closed_at);
              return (
                sum + (closed.getTime() - reported.getTime()) / 3600000
              );
            }, 0) / (tickets.length || 1);

          return {
            'Nama Teknisi': tech.nama || '-',
            'NIK': tech.nik || '-',
            'Total Tiket Selesai': tickets.length,
            'Avg Resolve Time (Jam)':
              tickets.length > 0 ? avgResolve.toFixed(1) : '-',
            'Reguler': tickets.filter((t) =>
              (t.customer_type || '').toLowerCase().includes('reguler'),
            ).length,
            'HVC Gold': tickets.filter((t) =>
              (t.customer_type || '').toLowerCase().includes('hvc_gold'),
            ).length,
            'HVC Platinum': tickets.filter((t) =>
              (t.customer_type || '').toLowerCase().includes('hvc_platinum'),
            ).length,
            'HVC Diamond': tickets.filter((t) =>
              (t.customer_type || '').toLowerCase().includes('hvc_diamond'),
            ).length,
            'SQM': tickets.filter((t) =>
              (t.jenis_tiket_1 || '').toLowerCase().includes('sqm'),
            ).length,
            'Indibiz/B2B': tickets.filter((t) =>
              ['indibiz', 'datin', 'reseller'].some((k) =>
                (t.jenis_tiket_1 || '').toLowerCase().includes(k),
              ),
            ).length,
          };
        });

        // Sheet 2: Detail semua tiket
        const detailData = allTickets.map((t) => {
          const tech = teknisiList.find((tk) => tk.id_user === t.teknisi_user_id);
          const reported = t.reported_date
            ? new Date(t.reported_date)
            : null;
          const closed = t.closed_at ? new Date(t.closed_at) : null;
          const resolveHours =
            reported && closed
              ? ((closed.getTime() - reported.getTime()) / 3600000).toFixed(1)
              : '-';
          return {
            'Nama Teknisi': tech?.nama || '-',
            'NIK': tech?.nik || '-',
            'No Tiket': t.incident || '-',
            'Customer': t.contact_name || '-',
            'Service No': t.service_no || '-',
            'Tipe Pelanggan': t.customer_type || '-',
            'Jenis Tiket': t.jenis_tiket_1 || '-',
            'Workzone': t.workzone || '-',
            'Tanggal Lapor': reported
              ? reported.toLocaleString('id-ID')
              : '-',
            'Tanggal Selesai': closed
              ? closed.toLocaleString('id-ID')
              : '-',
            'Resolve Time (Jam)': resolveHours,
            'RCA': t.rca || '-',
            'Sub RCA': t.sub_rca || '-',
            'Detail Perbaikan': t.description_solution_dompis || '-',
          };
        });

        // Build workbook
        const wb = XLSX.utils.book_new();

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

        const wsDetail = XLSX.utils.json_to_sheet(detailData);
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Tiket');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          tooLarge: false as const,
          filename: `Performa_Teknisi_${monthLabel.replace(' ', '_')}.xlsx`,
          bufferBase64: buffer.toString('base64'),
        };
      },
      CACHE_TTL_SECONDS,
    );

    if (!exportData || exportData.tooLarge) {
      return NextResponse.json(
        {
          success: false,
          message: `Export terlalu besar (${exportData?.count ?? DIRECT_EXPORT_MAX_ROWS}+ row). Persempit workzone atau periode export.`,
        },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(exportData.bufferBase64, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportData.filename}"`,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Export gagal'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
