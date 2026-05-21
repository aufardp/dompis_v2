export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runIngestion } from '@/lib/ingestion';
import { runProjection } from '@/lib/projection';
import { testExternalConnection, getTableNames } from '@/lib/external-db/connection';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { protectApi } from '@/app/libs/protectApi';

async function runLockedIngestionWithProjection() {
  const ingestionLock = await acquireLock('ingestion', 300);
  if (!ingestionLock.acquired) {
    return {
      locked: true,
      result: null,
      projection: null,
    };
  }

  try {
    const result = await runIngestion();
    const projectionLock = await acquireLock('projection', 300);
    if (!projectionLock.acquired) {
      return {
        locked: false,
        result,
        projection: null,
      };
    }

    try {
      const projection = await runProjection(undefined, {
        syncBatchId: result.syncBatchId,
      });
      return {
        locked: false,
        result,
        projection,
      };
    } finally {
      await releaseLock('projection', projectionLock.ownerId);
    }
  } finally {
    await releaseLock('ingestion', ingestionLock.ownerId);
  }
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    const envSecret = process.env.CRON_SECRET;

    if (secret !== envSecret) {
      await protectApi(['admin', 'superadmin']);
    }

    const connected = await testExternalConnection();
    if (!connected) {
      return NextResponse.json(
        { success: false, message: 'External DB not connected' },
        { status: 503 },
      );
    }

    const tables = getTableNames();
    const { locked, result, projection } = await runLockedIngestionWithProjection();
    if (locked || !result) {
      return NextResponse.json(
        { success: false, message: 'Ingestion already in progress' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Ingestion completed',
      tables,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      projection,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json(
      { success: false, message: 'Ingestion failed', error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin']);

    const connected = await testExternalConnection();
    if (!connected) {
      return NextResponse.json(
        { success: false, message: 'External DB not connected' },
        { status: 503 },
      );
    }

    const { locked, result, projection } = await runLockedIngestionWithProjection();
    if (locked || !result) {
      return NextResponse.json(
        { success: false, message: 'Ingestion already in progress' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Manual ingestion completed',
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      projection,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Manual ingestion error:', error);
    return NextResponse.json(
      { success: false, message: 'Ingestion failed', error: String(error) },
      { status: 500 },
    );
  }
}
