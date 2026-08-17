export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoundedString } from '@/lib/http-query';
import { getRcaSuggestions } from '@/app/libs/services/rca-suggestion.service';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'teknisi']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'rca-suggestion',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(req.url);
    const deviceName = toBoundedString(searchParams.get('deviceName'), 100);
    const symptom = toBoundedString(searchParams.get('symptom'), 1000);

    if (!deviceName) {
      return NextResponse.json(
        { success: false, message: 'deviceName wajib diisi' },
        { status: 400 },
      );
    }

    const data = await getRcaSuggestions({ deviceName, symptom });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to load RCA suggestion') },
      { status: getErrorStatus(error, 500) },
    );
  }
}