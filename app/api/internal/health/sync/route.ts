export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSyncHealth, getProjectionHealth, checkSyncHealth } from '@/lib/sync-metrics/metrics';
import { testExternalConnection } from '@/lib/external-db/connection';

export async function GET() {
  const health: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  try {
    const syncHealth = await getSyncHealth();
    const projectionHealth = await getProjectionHealth();
    const healthCheck = await checkSyncHealth();
    const externalDbStatus = await testExternalConnection();

    health.sync = syncHealth;
    health.projection = projectionHealth;
    health.externalDb = externalDbStatus ? 'connected' : 'disconnected';
    health.healthy = healthCheck.healthy;
    health.issues = healthCheck.issues;

    if (!healthCheck.healthy || !externalDbStatus) {
      health.status = 'warning';
    }

    const syncAge = syncHealth.lastSyncTime ? Date.now() - syncHealth.lastSyncTime : null;
    const maxAllowedAge = 15 * 60 * 1000;

    if (syncAge && syncAge > maxAllowedAge) {
      health.status = 'warning';
      const issues: string[] = healthCheck.issues || [];
      issues.push(`Last sync was ${Math.round(syncAge / 60000)} minutes ago`);
      health.issues = issues;
    }

    return NextResponse.json(health);
  } catch (error) {
    health.status = 'error';
    health.error = String(error);

    return NextResponse.json(health, { status: 500 });
  }
}