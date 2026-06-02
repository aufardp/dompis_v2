export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { withCircuitBreaker } from '@/app/libs/circuitBreaker';

async function handlePush() {
  try {
    const result = await withCircuitBreaker('google-sheets', async () => {
      return await pushSpreadsheet();
    }, { failureThreshold: 3, timeoutMs: 60000 });

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
      deleted: 0,
      updated: result.updated ?? 0,
      inserted: 0,
      skipped: result.skipped ?? 0,
      notInSheet: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Push API Error:', { error: String(error) });

    const isCircuitOpen = error instanceof Error && error.message.includes('Circuit breaker');

    return NextResponse.json(
      {
        success: false,
        message: isCircuitOpen 
          ? 'Layanan Google Sheets sedang unavailable. Silakan coba lagi nanti.' 
          : 'Push gagal',
        error: String(error),
      },
      { status: isCircuitOpen ? 503 : 500 },
    );
  }
}

export async function GET() {
  return handlePush();
}

export async function POST(req: Request) {
  const rateLimited = await enforceApiRateLimit(req, {
    namespace: 'push',
    limit: 10,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;
  return handlePush();
}
