import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache } from '@/lib/cache';

const STATS_CACHE_TTL = 30;

export async function GET(request: Request) {
  try {
    await protectApi(['admin', 'teknisi', 'helpdesk', 'superadmin']);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const areaId = searchParams.get('areaId');

    const cacheKey = `dashboard:stats:${type}:${areaId || 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    let result: any;

    if (type === 'technicians') {
      const whereClause: Record<string, any> = {
        roles: { key: 'teknisi' },
      };

      if (areaId) {
        whereClause.area_id = Number(areaId);
      }

      const technicians = await prisma.users.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { ticket: true },
          },
        },
        orderBy: { nama: 'asc' },
      });

      const rows = await Promise.all(
        technicians.map(async (tech) => {
          const completedOrders = await prisma.ticket.count({
            where: {
              teknisi_user_id: tech.id_user,
              HASIL_VISIT: 'CLOSE',
            },
          });
          const unfinishedOrders = await prisma.ticket.count({
            where: {
              teknisi_user_id: tech.id_user,
              HASIL_VISIT: { not: 'CLOSE' },
            },
          });
          const activeOrders = await prisma.ticket.count({
            where: {
              teknisi_user_id: tech.id_user,
              HASIL_VISIT: { not: 'CLOSE' },
            },
          });

          return {
            id: tech.id_user,
            nik: tech.nik,
            nama: tech.nama,
            jabatan: tech.jabatan,
            total_orders: tech._count.ticket,
            completed_orders: completedOrders,
            unfinished_orders: unfinishedOrders,
            active_orders: activeOrders,
          };
        }),
      );

      result = rows;
    } else if (type === 'stats') {
      const whereClause: Record<string, any> = {
        roles: { key: 'teknisi' },
      };

      if (areaId) {
        whereClause.area_id = Number(areaId);
      }

      const [totalTechnicians, busyTechniciansData, allTickets] =
        await Promise.all([
          prisma.users.count({ where: whereClause }),
          prisma.ticket.groupBy({
            by: ['teknisi_user_id'],
            where: {
              HASIL_VISIT: { not: 'CLOSE' },
              teknisi_user_id: { not: null },
            },
          }),
          prisma.ticket.findMany(),
        ]);

      const busyTechnicians = busyTechniciansData.length;
      const idleTechnicians = totalTechnicians - busyTechnicians;

      const totalTickets = allTickets.length;
      const completedTickets = allTickets.filter(
        (t) => t.HASIL_VISIT === 'CLOSE',
      ).length;
      const unfinishedTickets = totalTickets - completedTickets;

      result = {
        totalTechnicians,
        busyTechnicians,
        idleTechnicians,
        totalTickets,
        completedTickets,
        unfinishedTickets,
      };
    } else {
      return NextResponse.json(
        { success: false, message: 'Invalid type parameter' },
        { status: 400 },
      );
    }

    await setCache(cacheKey, result, STATS_CACHE_TTL);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
