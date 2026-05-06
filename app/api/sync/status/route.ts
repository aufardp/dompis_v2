export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';

let syncInProgress = false;
let lastSyncError: string | null = null;

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin', 'helpdesk']);

    const result = await prisma.ticket.aggregate({
      _max: {
        synced_at: true,
        sync_date: true,
      },
    });

    const lastSyncedAt = result._max.synced_at?.toISOString() ?? null;
    
    const envValue = process.env.SYNC_INTERVAL_MINUTES;
    const interval = parseInt(envValue ?? '1', 10) || 1;

    let nextSyncAt: string | null = null;
    
    if (lastSyncedAt) {
      const lastDate = new Date(lastSyncedAt);
      const now = new Date();
      
      // Calculate next sync: round up to next interval boundary
      const next = new Date(Math.ceil(now.getTime() / (interval * 60000)) * interval * 60000);
      nextSyncAt = next.toISOString();
    } else {
      nextSyncAt = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      data: {
        lastSyncedAt,
        lastSyncDate: result._max.sync_date?.toISOString().split('T')[0] ?? null,
        nextSyncAt,
        cronIntervalMinutes: interval,
        inProgress: syncInProgress,
        lastError: lastSyncError,
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

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin', 'helpdesk']);

    if (syncInProgress) {
      return NextResponse.json(
        { success: false, message: 'Sync already in progress' },
        { status: 409 },
      );
    }

    const cronSecret = req.headers.get('x-cron-secret');
    const envSecret = process.env.CRON_SECRET;

    if (cronSecret !== envSecret) {
      return NextResponse.json(
        { success: false, message: 'Invalid secret' },
        { status: 401 },
      );
    }

    const { syncSpreadsheet } = await import('@/lib/google-sheets/sync');

    syncInProgress = true;
    lastSyncError = null;

    setTimeout(() => {
      syncSpreadsheet()
        .then((result) => {
          console.log('[Manual Sync] Result:', result);
        })
        .catch((err) => {
          lastSyncError = err.message;
          console.error('[Manual Sync] Error:', err);
        })
        .finally(() => {
          syncInProgress = false;
        });
    }, 100);

    return NextResponse.json({
      success: true,
      message: 'Sync triggered',
    });
  } catch (error: unknown) {
    console.error('POST /sync/status error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to trigger sync',
      },
      { status: 500 },
    );
  }
}
