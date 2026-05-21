export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { broadcastSyncEvent } from '@/app/libs/sseBroadcast';
import { protectApi } from '@/app/libs/protectApi';
import { runProjection } from '@/lib/projection';
import { runIngestion } from '@/lib/ingestion';
import { publishSyncEvent, publishTicketInvalidate } from '@/lib/sse-redis';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    const envSecret = process.env.CRON_SECRET;

    if (secret !== envSecret) {
      await protectApi(['admin', 'superadmin', 'helpdesk']);
    }

    broadcastSyncEvent('start');

    const result = await runProjection();

    broadcastSyncEvent('complete', {
      inserted: result.inserted,
      updated: result.updated,
    });

    await publishTicketInvalidate('sync-complete');

    return NextResponse.json({
      success: true,
      message: 'Sync berhasil',
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (error) {
    broadcastSyncEvent('error', { error: String(error) });
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync gagal', error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin', 'helpdesk']);

    broadcastSyncEvent('start');

    // Try ingestion first (external DB → ticket_raw), then projection (ticket_raw → ticket)
    const ingestionLock = await acquireLock('ingestion', 300);
    if (ingestionLock.acquired) {
      try {
        await runIngestion();
      } catch (err) {
        console.warn('[Sync] Ingestion skipped atau gagal (mungkin external DB tidak tersedia):', String(err));
      } finally {
        await releaseLock('ingestion', ingestionLock.ownerId);
      }
    } else {
      console.log('[Sync] Ingestion already in progress by worker, melewati...');
    }

    const projectionLock = await acquireLock('projection', 300);
    if (!projectionLock.acquired) {
      broadcastSyncEvent('error', { error: 'Projection sedang berjalan' });
      return NextResponse.json(
        { success: false, message: 'Projection sedang berjalan oleh worker. Tunggu beberapa saat.' },
        { status: 409 },
      );
    }

    try {
      const result = await runProjection();

      broadcastSyncEvent('complete', {
        inserted: result.inserted,
        updated: result.updated,
      });

      await publishTicketInvalidate('sync-complete');

      return NextResponse.json({
        success: true,
        message: 'Manual sync berhasil',
        processed: result.processed,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        protected: result.protected,
      });
    } finally {
      await releaseLock('projection', projectionLock.ownerId);
    }
  } catch (error) {
    broadcastSyncEvent('error', { error: String(error) });
    console.error('Manual sync error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync gagal', error: String(error) },
      { status: 500 },
    );
  }
}
