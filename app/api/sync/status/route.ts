export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';

let lastSyncError: string | null = null;

const CHECKPOINT_NAME = 'ticket_raw_to_ticket';

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin', 'helpdesk']);

    const checkpoint = await prisma.ticket_projection_checkpoint.findUnique({
      where: { name: CHECKPOINT_NAME },
    });

    const envValue = process.env.PROJECTION_INTERVAL_SECONDS;
    const intervalSeconds = parseInt(envValue ?? '120', 10) || 120;
    const intervalMinutes = Math.round(intervalSeconds / 60);

    const lastSyncedAt = checkpoint?.completedAt?.toISOString() ?? null;

    let nextSyncAt: string | null = null;

    if (lastSyncedAt) {
      const now = Date.now();
      const next = Math.ceil(now / (intervalSeconds * 1000)) * (intervalSeconds * 1000);
      nextSyncAt = new Date(next).toISOString();
    } else {
      nextSyncAt = new Date().toISOString();
    }

    const inProgress = checkpoint?.status === 'running';

    return NextResponse.json({
      success: true,
      data: {
        lastSyncedAt,
        lastSyncDate: lastSyncedAt ? new Date(lastSyncedAt).toISOString().split('T')[0] : null,
        nextSyncAt,
        cronIntervalMinutes: intervalMinutes,
        inProgress,
        lastError: checkpoint?.lastError ?? lastSyncError,
      },
    });
  } catch (error: unknown) {
    console.error('GET /sync/status error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch sync status' },
      { status: 500 },
    );
  }
}
