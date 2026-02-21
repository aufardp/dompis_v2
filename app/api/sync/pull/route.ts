// app/api/sync/pull/route.ts
import { NextResponse } from 'next/server';
import {
  pullFromSheet,
  PullResult,
} from '@/app/libs/services/spreadsheet/pullFromSheet.service';

export async function POST(): Promise<NextResponse> {
  try {
    const result: PullResult = await pullFromSheet();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Pull error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
