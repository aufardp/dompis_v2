export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoundedString, toPositiveInt } from '@/lib/http-query';
import {
  getAuditLogs,
  getAuditFilterOptions,
} from '@/app/libs/services/audit-log.query';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'audit-log',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(req.url);
    const action = toBoundedString(searchParams.get('action'), 100);
    const resourceType = toBoundedString(searchParams.get('resourceType'), 50);
    const actorRole = toBoundedString(searchParams.get('actorRole'), 50);
    const search = toBoundedString(searchParams.get('search'), 200);
    const from = toBoundedString(searchParams.get('from'), 50);
    const to = toBoundedString(searchParams.get('to'), 50);
    const page = toPositiveInt(searchParams.get('page'), 1) || 1;
    const pageSize = toPositiveInt(searchParams.get('pageSize'), 25) || 25;

    const data = await getAuditLogs({
      action: action || undefined,
      resourceType: resourceType || undefined,
      actorRole: actorRole || undefined,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to load audit log') },
      { status: getErrorStatus(error, 500) },
    );
  }
}