export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { broadcastSyncEvent } from '@/app/libs/sseBroadcast';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    const envSecret = process.env.CRON_SECRET;

    if (secret !== envSecret) {
      await protectApi(['admin', 'superadmin', 'helpdesk']);
    }

    broadcastSyncEvent('start');

    const result = await syncSpreadsheet();

    broadcastSyncEvent('complete', {
      inserted: result.inserted,
      updated: result.updated,
    });

    return NextResponse.json({
      success: true,
      message: 'Sync berhasil',
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors,
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

    const result = await syncSpreadsheet();

    broadcastSyncEvent('complete', {
      inserted: result.inserted,
      updated: result.updated,
    });

    return NextResponse.json({
      success: true,
      message: 'Manual sync berhasil',
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    broadcastSyncEvent('error', { error: String(error) });
    console.error('Manual sync error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync gagal', error: String(error) },
      { status: 500 },
    );
  }
}
