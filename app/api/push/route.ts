export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { pushSpreadsheet } from '@/lib/google-sheets/push';

export async function GET() {
  try {
    const result = await pushSpreadsheet();

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: 'Push gagal', error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Push berhasil',
      count: result.count,
    });
  } catch (error) {
    console.error('Push error:', error);
    return NextResponse.json(
      { success: false, message: 'Push gagal', error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const result = await pushSpreadsheet();

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: 'Push gagal', error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Manual push berhasil',
      count: result.count,
    });
  } catch (error) {
    console.error('Manual push error:', error);
    return NextResponse.json(
      { success: false, message: 'Push gagal', error: String(error) },
      { status: 500 },
    );
  }
}
