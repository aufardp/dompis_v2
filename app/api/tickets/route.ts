import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import prisma from '@/app/libs/prisma';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const TICKETS_CACHE_TTL = 30;

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildTicketCacheKey(
  params: URLSearchParams,
  role: string,
  userId: number,
  isMonitoring: boolean = false,
): string {
  const filterParams = new URLSearchParams(params);
  filterParams.sort();
  return `tickets:${isMonitoring ? 'monitoring' : role}:${userId}:${filterParams.toString()}`;
}

// =====================================================
// GET TICKETS (ADMIN, TEKNISI, or PUBLIC for monitoring)
// =====================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isMonitoring = searchParams.get('monitoring') === 'true';

  if (isMonitoring) {
    return getMonitoringTickets(request);
  }

  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const hasilVisit =
      searchParams.get('hasilVisit') || searchParams.get('status') || undefined;
    const dept = searchParams.get('dept') || undefined;
    const ticketType =
      searchParams.get('ticketType') ||
      searchParams.get('jenisTiket') ||
      undefined;

    const filters = {
      search: searchParams.get('search') || '',
      hasilVisit,
      dept,
      ticketType,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toInt(searchParams.get('page'), 1),
      limit: toInt(searchParams.get('limit'), 50),
      sort: (searchParams.get('sort') as 'asc' | 'desc') || 'asc',
    };

    const cacheKey = buildTicketCacheKey(searchParams, user.role, user.id_user);
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const result = await TicketService.getTickets(
      user.role,
      user.id_user,
      filters,
    );

    await setCache(cacheKey, result, TICKETS_CACHE_TTL);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching tickets'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

// =====================================================
// GET TICKETS FOR MONITORING (No Auth)
// =====================================================
async function getMonitoringTickets(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = toInt(searchParams.get('page'), 1);
    const limit = toInt(searchParams.get('limit'), 50);

    const cacheKey = `tickets:monitoring:page:${page}:limit:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        cached: true,
      });
    }

    const offset = (page - 1) * limit;

    const [total, tickets] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.findMany({
        include: { users: { select: { nama: true } } },
        orderBy: { id_ticket: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const mappedTickets = tickets.map((row) => ({
      idTicket: row.id_ticket,
      ticket: row.INCIDENT,
      summary: row.SUMMARY,
      reportedDate: row.REPORTED_DATE,
      ownerGroup: row.OWNER_GROUP,
      serviceType: row.SERVICE_TYPE,
      customerType: row.CUSTOMER_TYPE,
      serviceNo: row.SERVICE_NO,
      contactName: row.CONTACT_NAME,
      contactPhone: row.CONTACT_PHONE,
      bookingDate: row.BOOKING_DATE,
      sourceTicket: row.SOURCE_TICKET,
      jenisTiket: row.JENIS_TIKET,
      flaggingManja: row.FLAGGING_MANJA,
      guaranteeStatus: row.GUARANTE_STATUS,
      workzone: row.WORKZONE,
      status: row.STATUS,
      hasilVisit: row.HASIL_VISIT,
      closedAt: row.closed_at,
      maxTtrReguler: row.JAM_EXPIRED_24_JAM_REGULER,
      maxTtrGold: row.JAM_EXPIRED_12_JAM_GOLD,
      maxTtrPlatinum: row.JAM_EXPIRED_6_JAM_PLATINUM,
      maxTtrDiamond: row.JAM_EXPIRED_3_JAM_DIAMOND,
      teknisiUserId: row.teknisi_user_id,
      technicianName: row.users?.nama,
    }));

    const responseData = {
      tickets: mappedTickets,
      page,
      limit,
      total,
      totalPages,
    };

    await setCache(cacheKey, responseData, TICKETS_CACHE_TTL);

    return NextResponse.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/tickets (monitoring) error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch tickets',
        data: {
          tickets: [],
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// =====================================================
// CREATE TICKET (ADMIN / HELPDESK)
// =====================================================
// export async function POST(request: Request) {
//   try {
//     const user = await protectApi(['admin', 'helpdesk']);

//     const body = await request.json();

//     const ticketData = {
//       contactName: body.contactName,
//       contactPhone: body.contactPhone,
//       serviceNo: body.serviceNo,
//       serviceType: body.serviceType,
//       customerType: body.customerType,
//       summary: body.summary,
//       symptom: body.symptom,
//       priority: body.priority,
//       ownerGroup: body.ownerGroup,
//       deviceName: body.deviceName,
//       areaId: body.areaId,
//     };

//     const result = await TicketService.(ticketData);

//     return NextResponse.json({
//       success: true,
//       message: 'Ticket created successfully',
//       data: result,
//     });
//   } catch (error: any) {
//     // Handle validation error (JSON errors array)
//     try {
//       const parsed = JSON.parse(error.message);
//       if (parsed.errors) {
//         return NextResponse.json(
//           {
//             success: false,
//             message: 'Validation failed',
//             errors: parsed.errors,
//           },
//           { status: 400 },
//         );
//       }
//     } catch {}

//     return NextResponse.json(
//       {
//         success: false,
//         message: error.message || 'Error creating ticket',
//       },
//       { status: 500 },
//     );
//   }
// }
