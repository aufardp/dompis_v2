export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { isRedisReady, redis } from '@/lib/redis';
import { fetchByIncidentAnyStatus } from '@/lib/external-db/qosmic-bridge/nossa';
import { enqueueBridgeCall } from '@/lib/external-db/qosmic-bridge/queue';
import { normalizeExternalRow, computeSourceHash } from '@/lib/ingestion/normalizer';
import { buildRawData } from '@/lib/ingestion/index';
import { broadcastTicketUpdated } from '@/app/libs/sseBroadcast';
import { nowWib } from '@/lib/timezone';
import type { ExternalRow } from '@/lib/external-db/types';
import type { QosmicResource } from '@/lib/external-db/qosmic-bridge/types';

const COOLDOWN_SECONDS = 10;
const RATE_LIMIT = 6;
const RATE_WINDOW = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (process.env.LIVE_REFRESH_ENABLED !== 'true') {
      return NextResponse.json(
        { ok: false, error: 'disabled' },
        { status: 503 },
      );
    }

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'ticket-live-refresh',
      limit: RATE_LIMIT,
      windowSeconds: RATE_WINDOW,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['admin', 'teknisi', 'helpdesk', 'superadmin']);

    const { id: idParam } = await params;
    const ticketId = Number(idParam);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invalid ticket id' },
        { status: 400 },
      );
    }

    // Per-ticket cooldown per user (before bridge call to avoid budget waste)
    const cooldownKey = `live-refresh:${ticketId}:${user.id_user}`;
    if (isRedisReady()) {
      const lastRefresh = await redis.get(cooldownKey);
      if (lastRefresh) {
        return NextResponse.json(
          { ok: false, error: 'Please wait before refreshing again', cooldownRemaining: COOLDOWN_SECONDS },
          { status: 429 },
        );
      }
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      select: { incident: true },
    });

    if (!ticket?.incident) {
      return NextResponse.json(
        { ok: false, error: 'Ticket not found' },
        { status: 404 },
      );
    }

    const incident = ticket.incident;

    const found = await enqueueBridgeCall(
      () => fetchByIncidentAnyStatus<Record<string, unknown>>(incident),
      'interactive',
    );

    if (!found) {
      if (isRedisReady()) {
        void redis.setex(cooldownKey, COOLDOWN_SECONDS, '1').catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        refreshed: false,
        ticket: null,
        source: null,
        incident,
        message: 'Ticket not found in external system',
      });
    }

    const row = found.row as unknown as ExternalRow;
    const resource: QosmicResource = found.resource;
    const normalized = normalizeExternalRow(row, resource);
    const sourceHash = computeSourceHash(normalized);
    const now = nowWib();

    // Check if already up-to-date
    let refreshed = false;
    const existing = await prisma.ticket_raw.findUnique({
      where: { incident },
      select: { sourceHash: true },
    });

    if (existing?.sourceHash !== sourceHash) {
      const batchId = `live-refresh-${ticketId}-${Date.now()}`;
      const data = buildRawData(normalized, sourceHash, now, batchId, 1, resource, incident);

      await prisma.ticket_raw.upsert({
        where: { incident },
        create: data,
        update: data,
      });

      broadcastTicketUpdated({
        ticketId: incident,
        incident,
        changedFields: ['*'],
        source: 'manual',
        updatedAt: now.toISOString(),
      });

      refreshed = true;
    }

    // Set cooldown after successful refresh attempt
    if (isRedisReady()) {
      void redis.setex(cooldownKey, COOLDOWN_SECONDS, '1').catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      refreshed,
      source: resource,
      incident,
      message: refreshed ? 'Ticket refreshed successfully' : 'Already up to date',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error, 'Failed to refresh ticket'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
