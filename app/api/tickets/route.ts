import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import pool, { RowDataPacket } from '@/lib/db';

export const dynamic = 'force-dynamic';

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// =====================================================
// GET TICKETS (ADMIN, TEKNISI, or PUBLIC for monitoring)
// =====================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isMonitoring = searchParams.get('monitoring') === 'true';

  // If monitoring mode, skip auth and return all tickets
  if (isMonitoring) {
    return getMonitoringTickets(request);
  }

  // Otherwise, require authentication
  try {
    console.log('[GET /api/tickets] Authenticated request');

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    console.log('[GET /api/tickets] User authenticated:', {
      role: user.role,
      id: user.id_user,
    });

    const hasilVisit =
      searchParams.get('hasilVisit') || searchParams.get('status') || undefined;

    const filters = {
      search: searchParams.get('search') || '',
      hasilVisit,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      page: toInt(searchParams.get('page'), 1),
      limit: toInt(searchParams.get('limit'), 50),
      sort: (searchParams.get('sort') as 'asc' | 'desc') || 'asc',
    };

    console.log('[GET /api/tickets] Filters:', filters);

    const result = await TicketService.getTickets(
      user.role,
      user.id_user,
      filters,
    );

    console.log('[GET /api/tickets] Result:', {
      total: result.total,
      ticketsCount: result.data?.length ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('GET /tickets error:', error);

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

    const offset = (page - 1) * limit;

    console.log('[Monitoring API] Request received:', { page, limit, offset });

    const [countResult] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM ticket',
    );
    const total = countResult[0]?.total ?? 0;
    console.log('[Monitoring API] Total tickets in DB:', total);
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT 
        t.*, 
        u.nama AS NAMA_TEKNISI
      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user
      ORDER BY t.id_ticket DESC
      LIMIT ? OFFSET ?
    `,
      [limit, offset],
    );

    console.log('[Monitoring API] Rows returned:', rows.length);
    if (rows.length > 0) {
      console.log('[Monitoring API] Sample ticket:', {
        id_ticket: (rows[0] as any).id_ticket,
        INCIDENT: (rows[0] as any).INCIDENT,
        SUMMARY: (rows[0] as any).SUMMARY,
      });
    }

    const tickets = rows.map((row: any) => ({
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
      workzone: row.WORKZONE,
      status: row.STATUS,
      hasilVisit: row.HASIL_VISIT,
      closedAt: row.closed_at,
      maxTtrReguler: row.JAM_EXPIRED_24_JAM_REGULER,
      maxTtrGold: row.JAM_EXPIRED_12_JAM_GOLD,
      maxTtrPlatinum: row.JAM_EXPIRED_6_JAM_PLATINUM,
      maxTtrDiamond: row.JAM_EXPIRED_3_JAM_DIAMOND,
      teknisiUserId: row.teknisi_user_id,
      technicianName: row.NAMA_TEKNISI,
    }));

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        page,
        limit,
        total,
        totalPages,
      },
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
