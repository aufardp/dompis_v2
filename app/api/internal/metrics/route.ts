export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSyncMetrics } from '@/lib/sync-metrics/metrics';
import { prisma } from '@/app/libs/prisma';
import { getExternalPool, getTableNames, testExternalConnection } from '@/lib/external-db/connection';

export async function GET() {
  const metrics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    const syncMetrics = await getSyncMetrics();
    const externalDbStatus = await testExternalConnection();

    const tableCounts: Record<string, number> = {};
    const externalPool = getExternalPool();

    if (externalDbStatus && externalPool) {
      const tableNames = getTableNames();

      for (const tableName of tableNames) {
        try {
          const [rows] = await externalPool!.query('SELECT COUNT(*) as count FROM ??', [tableName]);
          const typedRows = rows as unknown as Array<{ count: number }>;
          tableCounts[tableName] = typedRows[0]?.count || 0;
        } catch {
          tableCounts[tableName] = -1;
        }
      }
    }

    const ticketRawCount = await prisma.ticket_raw.count({
      where: { isActive: true },
    });

    const ticketRawInactiveCount = await prisma.ticket_raw.count({
      where: { isActive: false },
    });

    const ticketCount = await prisma.ticket.count();

    const pendingOutbox = await prisma.tech_event_outbox.count({
      where: { status: 'PENDING' },
    });

    metrics.sync = syncMetrics.sync;
    metrics.projection = syncMetrics.projection;
    metrics.worker = syncMetrics.worker;
    metrics.database = {
      internal: {
        ticket_raw_active: ticketRawCount,
        ticket_raw_inactive: ticketRawInactiveCount,
        ticket: ticketCount,
        outbox_pending: pendingOutbox,
      },
      external: {
        status: externalDbStatus ? 'connected' : 'disconnected',
        tables: tableCounts,
      },
    };

    return NextResponse.json(metrics);
  } catch (error) {
    metrics.status = 'error';
    metrics.error = String(error);

    return NextResponse.json(metrics, { status: 500 });
  }
}