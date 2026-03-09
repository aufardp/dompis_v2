export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { pushSpreadsheet } from '@/lib/google-sheets/push';

async function handlePush() {
  try {
    const result = await pushSpreadsheet();

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          message: 'Push tidak dijalankan (mungkin sedang berjalan)',
        },
        { status: 409 },
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Push gagal',
          error: result.error,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Push berhasil',
      updated: result.updated ?? 0,
      inserted: result.inserted ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Push API Error:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Push gagal',
        error: String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handlePush();
}

export async function POST() {
  return handlePush();
}
