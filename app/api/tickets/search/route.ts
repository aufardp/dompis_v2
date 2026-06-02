import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoundedString, toEnumValue } from '@/lib/http-query';

export async function GET(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-search',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const { searchParams } = new URL(req.url);
    const q = toBoundedString(searchParams.get('q'), 100);
    const type =
      toEnumValue(searchParams.get('type'), [
        'incident',
        'contact',
        'service',
      ]) ?? 'incident';

    if (!q) {
      return NextResponse.json(
        { success: false, message: 'Search query parameter "q" is required' },
        { status: 400 },
      );
    }

    let result;

    switch (type) {
      case 'incident':
        result = await TicketService.search(q, user.role, user.id_user);
        break;
      case 'contact':
        result = await TicketService.searchByContactName(
          q,
          user.role,
          user.id_user,
        );
        break;
      case 'service':
        result = await TicketService.searchByServiceNo(
          q,
          user.role,
          user.id_user,
        );
        break;
      default:
        return NextResponse.json(
          {
            success: false,
            message:
              'Invalid type parameter. Must be "incident", "contact", or "service"',
          },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      total: result.length,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
