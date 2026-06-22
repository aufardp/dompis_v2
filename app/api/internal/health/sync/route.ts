export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSyncHealth, getProjectionHealth, checkSyncHealth } from '@/lib/sync-metrics/metrics';
import { testExternalConnection } from '@/lib/external-db/connection';
import { authorizeInternalRoute } from '@/app/libs/internalRouteAuth';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getMetricAgeMs, parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';

export async function GET(req: NextRequest) {
  try {
    await authorizeInternalRoute(req);

    const health: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    const syncHealth = await getSyncHealth();
    const projectionHealth = await getProjectionHealth();
    const healthCheck = await checkSyncHealth();
    const externalDbStatus = await testExternalConnection();
    const syncAgeMs = getMetricAgeMs(syncHealth.lastSyncTime);
    const projectionAgeMs = getMetricAgeMs(projectionHealth.lastProjectionTime);
    const projectionBacklog = parseProjectionCheckpointMeta(
      projectionHealth.checkpoint,
    );

    health.sync = syncHealth;
    health.projection = projectionHealth;
    health.externalDb = externalDbStatus ? 'connected' : 'disconnected';
    health.healthy = healthCheck.healthy;
    health.issues = healthCheck.issues;
    health.lag = {
      syncAgeMs,
      projectionAgeMs,
      projectionNeverProjected:
        projectionHealth.neverProjectedCount ?? projectionBacklog.neverProjected,
      projectionOldestPendingAgeMs:
        projectionHealth.oldestPendingAgeMs ?? projectionBacklog.oldestPendingAgeMs,
    };

    if (!healthCheck.healthy || !externalDbStatus) {
      health.status = 'warning';
    }

    const syncAge = syncAgeMs;
    const maxAllowedAge = 15 * 60 * 1000;
    const maxAllowedProjectionAge = 15 * 60 * 1000;
    const maxAllowedProjectionPendingAge = 20 * 60 * 1000;

    if (syncAge && syncAge > maxAllowedAge) {
      health.status = 'warning';
      const issues: string[] = healthCheck.issues || [];
      issues.push(`Last sync was ${Math.round(syncAge / 60000)} minutes ago`);
      health.issues = issues;
    }

    if (projectionAgeMs && projectionAgeMs > maxAllowedProjectionAge) {
      health.status = 'warning';
      const issues: string[] = Array.isArray(health.issues) ? [...(health.issues as string[])] : [];
      issues.push(
        `Last projection was ${Math.round(projectionAgeMs / 60000)} minutes ago`,
      );
      health.issues = issues;
    }

    if (
      projectionBacklog.oldestPendingAgeMs &&
      projectionBacklog.oldestPendingAgeMs > maxAllowedProjectionPendingAge
    ) {
      health.status = 'warning';
      const issues: string[] = Array.isArray(health.issues) ? [...(health.issues as string[])] : [];
      issues.push(
        `Oldest unprojected raw row is ${Math.round(
          projectionBacklog.oldestPendingAgeMs / 60000,
        )} minutes old`,
      );
      health.issues = issues;
    }

    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch sync health'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
