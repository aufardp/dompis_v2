import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';

export interface ActiveRefreshResult {
  batchId: string;
  scanned: number;
  updated: number;
  durationMs: number;
}

const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('ACTIVE_REFRESH_BATCH_SIZE', 1000);
const DEFAULT_MAX_SCAN_PER_RUN = parsePositiveIntEnv(
  'ACTIVE_REFRESH_MAX_SCAN_PER_RUN',
  5000,
);

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
      (batchId, status, batchSize, maxScan, startedAt)
    VALUES
      (${batchId}, 'running', ${DEFAULT_BATCH_SIZE}, ${DEFAULT_MAX_SCAN_PER_RUN}, ${nowWib()})
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

async function fetchCandidateTicketIds(
  lastId: number,
  today: Date,
  limit: number,
): Promise<Array<{ id_ticket: number }>> {
  return prisma.$queryRaw<Array<{ id_ticket: number }>>`
    SELECT t.id_ticket
    FROM ticket t
    WHERE t.id_ticket > ${lastId}
      AND (
        t.sync_date IS NULL
        OR t.sync_date <> ${today}
      )
      AND (
        t.status IS NULL
        OR t.status NOT IN ('closed', 'Closed', 'CLOSED')
        OR t.status_update IN ('open', 'assigned', 'on_progress', 'pending')
        OR t.status_update IN ('OPEN', 'ASSIGNED', 'ON_PROGRESS', 'PENDING')
        OR (
          t.pending_dompis IS NOT NULL
          AND t.pending_dompis <> ''
        )
      )
    ORDER BY t.id_ticket ASC
    LIMIT ${limit}
  `;
}

async function filterRawActiveTicketIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.$queryRaw<Array<{ id_ticket: number }>>`
    SELECT t.id_ticket
    FROM ticket t
    INNER JOIN ticket_raw tr ON tr.incident = t.incident
    WHERE t.id_ticket IN (${Prisma.join(ids)})
      AND tr.isActive = TRUE
      AND (
        tr.status IS NULL
        OR tr.status NOT IN ('closed', 'Closed', 'CLOSED')
      )
  `;

  return rows.map((row) => row.id_ticket);
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

    while (result.scanned < DEFAULT_MAX_SCAN_PER_RUN) {
      assertNotAborted(signal);
      const remainingScan = DEFAULT_MAX_SCAN_PER_RUN - result.scanned;
      const rows = await fetchCandidateTicketIds(
        lastId,
        today,
        Math.min(DEFAULT_BATCH_SIZE, remainingScan),
      );
      if (rows.length === 0) break;

      lastId = rows[rows.length - 1]!.id_ticket;
      result.scanned += rows.length;
      const activeIds = await filterRawActiveTicketIds(
        rows.map((row) => row.id_ticket),
      );

      for (const chunk of chunkArray(
        activeIds,
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
