import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoundedString } from '@/lib/http-query';
import { fetchByIncidentAnyStatus } from '@/lib/external-db/qosmic-bridge/nossa';
import { enqueueBridgeCall } from '@/lib/external-db/qosmic-bridge/queue';
import { normalizeExternalRow } from '@/lib/ingestion/normalizer';
import type { ExternalRow, NormalizedExternalRow } from '@/lib/external-db/types';
import type { QosmicResource } from '@/lib/external-db/qosmic-bridge/types';

export async function GET(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'nossa-search',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const { searchParams } = new URL(req.url);
    const incident = toBoundedString(searchParams.get('incident'), 50);

    if (!incident) {
      return NextResponse.json(
        {
          success: false,
          message: 'Query parameter "incident" is required',
        },
        { status: 400 },
      );
    }

    const found = await enqueueBridgeCall(
      () =>
        fetchByIncidentAnyStatus<Record<string, unknown>>(incident),
      'interactive',
    );

    if (!found) {
      return NextResponse.json({
        success: true,
        data: null,
        resource: null,
        found: false,
        incident,
      });
    }

    const row = found.row as unknown as ExternalRow;
    const resource: QosmicResource = found.resource;
    const normalized = normalizeExternalRow(row, resource);

    return NextResponse.json({
      success: true,
      data: normalized as NormalizedExternalRow,
      resource,
      found: true,
      incident,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to search external ticket'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
