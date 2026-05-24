import { prisma } from '@/app/libs/prisma';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';

export interface ActiveRefreshResult {
  batchId: string;
  scanned: number;
  updated: number;
  durationMs: number;
}

const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('ACTIVE_REFRESH_BATCH_SIZE', 1000);

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Active refresh aborted');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function createRunLog(batchId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO active_refresh_run_log
      (batchId, status, batchSize, startedAt)
    VALUES
      (${batchId}, 'running', ${DEFAULT_BATCH_SIZE}, ${nowWib()})
  `;
}

async function finishRunLog(
  batchId: string,
  status: 'success' | 'failed' | 'aborted',
  result: Pick<ActiveRefreshResult, 'scanned' | 'updated' | 'durationMs'>,
  errorMessage?: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE active_refresh_run_log
    SET
      status = ${status},
      scanned = ${result.scanned},
      updated = ${result.updated},
      durationMs = ${result.durationMs},
      errorMessage = ${errorMessage?.slice(0, 1000) ?? null},
      finishedAt = ${nowWib()}
    WHERE batchId = ${batchId}
  `;
}

async function fetchActiveTicketIds(
  lastId: number,
  today: Date,
  limit: number,
): Promise<Array<{ id_ticket: number }>> {
  return prisma.$queryRaw<Array<{ id_ticket: number }>>`
    SELECT t.id_ticket
    FROM ticket t
    INNER JOIN ticket_raw tr ON tr.incident = t.incident
    WHERE t.id_ticket > ${lastId}
      AND tr.isActive = TRUE
      AND COALESCE(LOWER(tr.status), '') <> 'closed'
      AND (
        t.sync_date IS NULL
        OR t.sync_date <> ${today}
      )
      AND (
        COALESCE(LOWER(t.status), '') <> 'closed'
        OR COALESCE(LOWER(t.status_update), '') IN ('open', 'assigned', 'on_progress', 'pending')
        OR (
          t.pending_dompis IS NOT NULL
          AND t.pending_dompis <> ''
        )
      )
    ORDER BY t.id_ticket ASC
    LIMIT ${limit}
  `;
}

async function refreshTicketIds(ids: number[], batchId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const now = nowWib();
  const today = todayWibDateForDb();
  const result = await prisma.ticket.updateMany({
    where: { id_ticket: { in: ids } },
    data: {
      sync_date: today,
      synced_at: now,
      import_batch: batchId,
    },
  });
  return result.count;
}

export async function runActiveRefresh(
  signal?: AbortSignal,
): Promise<ActiveRefreshResult> {
  const start = Date.now();
  const batchId = `active-refresh-${Date.now()}`;
  const result: ActiveRefreshResult = {
    batchId,
    scanned: 0,
    updated: 0,
    durationMs: 0,
  };

  if (process.env.ACTIVE_REFRESH_ENABLED !== 'true') {
    result.durationMs = Date.now() - start;
    return result;
  }

  await createRunLog(batchId);

  try {
    const today = todayWibDateForDb();
    let lastId = 0;

    while (true) {
      assertNotAborted(signal);
      const rows = await fetchActiveTicketIds(lastId, today, DEFAULT_BATCH_SIZE);
      if (rows.length === 0) break;

      lastId = rows[rows.length - 1]!.id_ticket;
      result.scanned += rows.length;

      for (const chunk of chunkArray(
        rows.map((row) => row.id_ticket),
        DEFAULT_BATCH_SIZE,
      )) {
        assertNotAborted(signal);
        result.updated += await refreshTicketIds(chunk, batchId);
      }
    }

    result.durationMs = Date.now() - start;
    await finishRunLog(batchId, 'success', result);
    return result;
  } catch (error) {
    result.durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    await finishRunLog(
      batchId,
      message.includes('Active refresh aborted') ? 'aborted' : 'failed',
      result,
      message,
    ).catch(() => undefined);
    throw error;
  }
}
