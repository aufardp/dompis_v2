export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { syncSpreadsheet } from '@/lib/google-sheets/sync';

export async function GET() {
  try {
    const result = await syncSpreadsheet();

    return NextResponse.json({
      success: true,
      message: 'Sync berhasil',
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync gagal', error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const result = await syncSpreadsheet();

    return NextResponse.json({
      success: true,
      message: 'Manual sync berhasil',
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Manual sync error:', error);
    return NextResponse.json(
      { success: false, message: 'Sync gagal', error: String(error) },
      { status: 500 },
    );
  }
}
