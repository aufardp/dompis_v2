import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';

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

    const filters = {
      search: searchParams.get('search') || '',
      status: searchParams.get('status') || undefined,
      priority: searchParams.get('priority') || undefined,
      workzone: searchParams.get('workzone') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    };

    let result;

    // 🔹 ADMIN & HELPDESK → lihat semua
    if (user.role === 'admin' || user.role === 'helpdesk') {
      result = await TicketService.getTickets('admin', undefined, filters);
    }

    // 🔹 TEKNISI → hanya tiket miliknya
    if (user.role === 'teknisi') {
      result = await TicketService.getTickets('teknisi', user.id_user, filters);
    }

    // 🔹 SUPERADMIN → lihat semua
    if (user.role === 'superadmin') {
      result = await TicketService.getTickets('admin', undefined, filters);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('GET /tickets error:', error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Error fetching tickets',
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
