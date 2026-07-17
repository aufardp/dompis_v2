import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'bucket-counts',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);
    const workzone = searchParams.get('workzone') || undefined;

    const result = await DailyTicketService.getBucketCounts(
      user.role,
      user.id_user,
      { workzone },
    );

    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching bucket counts'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
