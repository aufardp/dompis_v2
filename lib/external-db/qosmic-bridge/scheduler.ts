import { prisma } from '@/app/libs/prisma';
import { ingestionQueue, backfillQueue } from './bridge-queue';
import { isQosmicBridgeConfigured } from './client';
import { splitIntoInitialWindows } from './window-planner';
import type { QosmicResource } from './types';

export async function enqueueScheduledBridgeScan(resource: QosmicResource): Promise<void> {
  if (!isQosmicBridgeConfigured() || process.env.BRIDGE_JOB_INGESTION_ENABLED !== 'true') return;
  const name = `ingest-${resource}`;
  const existing = await ingestionQueue.getJob(name);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'failed' && state !== 'completed') return;
    await existing.remove();
  }
  await ingestionQueue.add(name, { table: resource, correlationId: `scheduled-${resource}-${Date.now()}` }, {
    jobId: name, priority: resource === 'nossa' ? 1 : 5,
  });
}

export async function enqueueHistoricalSweep(): Promise<void> {
  if (!isQosmicBridgeConfigured() || process.env.BRIDGE_JOB_BACKFILL_ENABLED !== 'true') return;
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const week = new Date(`${today}T00:00:00Z`);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
  const scope = `bridge-history:${week.toISOString().slice(0, 10)}:`;
  const checkpoints = await prisma.ingestion_checkpoint.findMany({
    where: { tableName: { startsWith: scope } }, select: { tableName: true, status: true },
  });
  const completed = new Set(checkpoints.filter(row => ['success', 'partial'].includes(row.status)).map(row => row.tableName));
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const windows = splitIntoInitialWindows(process.env.BRIDGE_HISTORY_FROM || '2026-01-01', tomorrow.toISOString().slice(0, 10), 7);
  for (const window of windows.reverse()) {
    const from = window.dateFrom;
    const to = window.dateTo;
    const checkpointKey = `${scope}${from}:${to}`;
    if (completed.has(checkpointKey)) continue;
    const jobId = checkpointKey.replace(/[^a-zA-Z0-9-]/g, '-');
    const existing = await backfillQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (!['failed', 'completed'].includes(state)) continue;
      await existing.remove();
    }
    await backfillQueue.add('backfill:window', { from, to, checkpointKey }, { jobId });
  }
}
