import { logger } from '@/lib/observability/logger';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { PROJECTION_CONTRACT_VERSION } from '@/lib/ingestion/sync-state';
import {
  bulkInsertTicket, bulkUpsertProjectionLog, bulkUpsertTicket,
  emptyProjectionResult, prepareProjectionItems, withTransactionRetry,
  type ProjectionOptions, type ProjectionResult, type RawSelectResult,
} from './index';
import { flushProjectionEffects } from './effects';
import { recordProjectionMetric } from '@/lib/sync-metrics/metrics';

type PendingRaw = RawSelectResult & { rawRevision: bigint; manualReopenHash: string | null };

export async function fetchPendingRaw(batchSize: number, options: ProjectionOptions): Promise<PendingRaw[]> {
  return prisma.$queryRaw<PendingRaw[]>`
    SELECT tr.*, ext.c_description_serviceid, s.rawRevision, s.manualReopenHash
    FROM ticket_sync_state s
    JOIN ticket_raw tr ON tr.incident = s.incident
    LEFT JOIN ticket_raw_bridge_ext ext ON ext.incident = tr.incident
    WHERE s.pending = TRUE AND s.nextAttemptAt <= UTC_TIMESTAMP(3)
      AND tr.isActive = TRUE
      ${options.incident ? Prisma.sql`AND tr.incident = ${options.incident}` : Prisma.empty}
      ${options.syncBatchId ? Prisma.sql`AND tr.syncBatchId = ${options.syncBatchId}` : Prisma.empty}
    ORDER BY s.nextAttemptAt, s.incident
    LIMIT ${batchSize}
  `;
}

async function applyPendingBatch(rows: PendingRaw[]): Promise<Awaited<ReturnType<typeof prepareProjectionItems>>> {
  const prepared = await prepareProjectionItems(rows, { force: true });
  const classifications = new Map(prepared.map(item => [item.raw.incident!, {
    jenis_tiket_1: item.upsert.create.jenis_tiket_1 ?? null,
    jenis_tiket_2: item.upsert.create.jenis_tiket_2 ?? null,
  }]));
  const ordered = [...rows].sort((a, b) => a.incident!.localeCompare(b.incident!));
  return withTransactionRetry(async tx => {
    const CHUNK = 50;
    const allStates: Array<{ incident: string; rawRevision: bigint; pending: boolean }> = [];
    for (let i = 0; i < ordered.length; i += CHUNK) {
      const chunk = ordered.slice(i, i + CHUNK);
      const states = await tx.$queryRaw<Array<{ incident: string; rawRevision: bigint; pending: boolean }>>`
        SELECT incident, rawRevision, pending FROM ticket_sync_state
        WHERE incident IN (${Prisma.join(chunk.map(row => row.incident!))}) ORDER BY incident FOR UPDATE
      `;
      allStates.push(...states);
    }
    const stateMap = new Map(allStates.map(state => [state.incident, state]));
    const current = ordered.filter(row => {
      const state = stateMap.get(row.incident!);
      return state?.pending && state.rawRevision === row.rawRevision;
    });
    if (!current.length) return [];
    for (let i = 0; i < current.length; i += CHUNK) {
      const chunk = current.slice(i, i + CHUNK);
      await tx.$queryRaw`
        SELECT id_ticket FROM ticket WHERE incident IN (${Prisma.join(chunk.map(row => row.incident!))})
        ORDER BY incident FOR UPDATE
      `;
    }
    const items = await prepareProjectionItems(current, { tx, force: true, classifications });
    await bulkInsertTicket(tx, items.filter(item => item.action === 'inserted'));
    await bulkUpsertTicket(tx, items.filter(item => item.action === 'updated'));
    await bulkUpsertProjectionLog(tx, items, 1);
    const now = new Date();
    for (let i = 0; i < current.length; i += CHUNK) {
      const chunk = current.slice(i, i + CHUNK);
      await tx.$executeRaw`
        UPDATE ticket_sync_state SET appliedRevision = rawRevision, pending = FALSE,
          projectionVersion = ${PROJECTION_CONTRACT_VERSION}, projectedAt = ${now},
          nextAttemptAt = NULL, attempts = 0, lastError = NULL
        WHERE incident IN (${Prisma.join(chunk.map(row => row.incident!))})
      `;
    }
    const changed = items.filter(item => item.action !== 'skipped');
    if (changed.length) {
      for (let i = 0; i < changed.length; i += CHUNK) {
        const chunk = changed.slice(i, i + CHUNK);
        await tx.$executeRaw`
          UPDATE ticket_sync_state SET effectsRevision = effectsRevision + 1, effectsPending = TRUE
          WHERE incident IN (${Prisma.join(chunk.map(item => item.raw.incident!))})
        `;
      }
    }
    return items;
  });
}

function addResults(result: ProjectionResult, items: Awaited<ReturnType<typeof prepareProjectionItems>>): void {
  for (const item of items) {
    result.processed++;
    result[item.action]++;
    if (item.protected) result.protected++;
    if (item.statusResolution?.statusUpdate === 'open') result.setToOpen++;
    if (item.statusResolution?.statusUpdate === 'close') result.setToClose++;
    result.checkpoint = {
      lastProjectedImportedAt: item.raw.importedAt,
      lastProjectedTicketRawId: item.raw.id_ticket,
      syncBatchId: item.raw.syncBatchId,
    };
  }
}

export async function runPendingProjection(signal?: AbortSignal, options: ProjectionOptions = {}): Promise<ProjectionResult> {
  const result = emptyProjectionResult();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 50, 250));
  const started = Date.now();
  const budget = Math.max(1000, Number(process.env.PROJECTION_RUN_BUDGET_MS) || 30000);
  let lastEffectsAt = 0;
  const flushEffects = async (force = false) => {
    if (!force && Date.now() - lastEffectsAt < 1000) return;
    await flushProjectionEffects().catch(error => logger.warn('Projection notification remains pending', { error: String(error) }));
    lastEffectsAt = Date.now();
  };
  while (!signal?.aborted && Date.now() - started < budget) {
    const rows = await fetchPendingRaw(batchSize, options);
    if (!rows.length) break;
    try {
      addResults(result, await applyPendingBatch(rows));
      await flushEffects();
    } catch {
      for (const row of rows) {
        if (signal?.aborted) break;
        try {
          addResults(result, await applyPendingBatch([row]));
        } catch (error) {
          result.failed++;
          result.errors.push({ incident: row.incident!, error: String(error) });
          await prisma.$executeRaw`
            UPDATE ticket_sync_state SET attempts = attempts + 1, lastError = ${String(error).slice(0, 2000)},
              nextAttemptAt = TIMESTAMPADD(SECOND, LEAST(300, 5 * POW(2, LEAST(attempts, 6))), UTC_TIMESTAMP(3))
            WHERE incident = ${row.incident} AND rawRevision = ${row.rawRevision} AND pending = TRUE
          `;
        }
        await flushEffects();
      }
    }
  }
  if (signal?.aborted) throw new Error('Projection aborted');
  const oldest = await prisma.ticket_sync_state.findFirst({ where: { pending: true }, orderBy: { pendingSince: 'asc' }, select: { pendingSince: true } });
  result.pending = oldest ? await prisma.ticket_sync_state.count({ where: { pending: true } }) : 0;
  result.oldestPendingSince = oldest?.pendingSince ?? null;
  await recordProjectionMetric('oldestPendingAgeMs', oldest?.pendingSince ? Math.max(0, Date.now() - oldest.pendingSince.getTime()) : 0);
  await flushEffects(true);
  return result;
}
