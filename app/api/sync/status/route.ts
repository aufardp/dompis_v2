export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';

let lastSyncError: string | null = null;

const CHECKPOINT_NAME = 'ticket_raw_to_ticket';

async function handleSyncStatus() {
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
}

export async function GET() {
  try {
    return await handleSyncStatus();
  } catch (error: any) {
    if (error?.code === 'P1017' || error?.message?.includes('Server has closed the connection')) {
      console.warn('[SyncStatus] P1017 connection lost — retrying once after 500ms');
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await handleSyncStatus();
      } catch (inner: any) {
        console.error('[SyncStatus] Retry also failed:', inner);
        return NextResponse.json(
          { success: false, message: 'Database connection lost' },
          { status: 503 },
        );
      }
    }
    console.error('GET /sync/status error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch sync status' },
      { status: 500 },
    );
  }
}
