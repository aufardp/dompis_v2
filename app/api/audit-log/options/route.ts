export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getAuditFilterOptions } from '@/app/libs/services/audit-log.query';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const data = await getAuditFilterOptions();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to load audit options') },
      { status: getErrorStatus(error, 500) },
    );
  }
}