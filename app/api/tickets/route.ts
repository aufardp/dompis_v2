import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// =====================================================
// GET TICKETS (ADMIN & TEKNISI)
// =====================================================
export async function GET(request: Request) {
  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const { searchParams } = new URL(request.url);

    const hasilVisit =
      searchParams.get('hasilVisit') || searchParams.get('status') || undefined;

    const filters = {
      search: searchParams.get('search') || '',
      hasilVisit,
      workzone: searchParams.get('workzone') || undefined,
      page: toInt(searchParams.get('page'), 1),
      limit: toInt(searchParams.get('limit'), 50),
    };

    const result = await TicketService.getTickets(
      user.role,
      user.id_user,
      filters,
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('GET /tickets error:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Error fetching tickets',
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
