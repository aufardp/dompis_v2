export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin', 'helpdesk']);

    const result = await prisma.ticket.aggregate({
      _max: {
        synced_at: true,
        sync_date: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        lastSyncedAt: result._max.synced_at?.toISOString() ?? null,
        lastSyncDate: result._max.sync_date?.toISOString().split('T')[0] ?? null,
      },
    });
  } catch (error: unknown) {
    console.error('GET /sync/status error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch sync status',
      },
      { status: 500 },
    );
  }
}
