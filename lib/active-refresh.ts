import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isRedisReady, redis } from '@/lib/redis';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import { publishTicketInvalidate, publishTicketViewers } from '@/lib/sse-redis';
import { invalidateTicketsCache } from '@/lib/cache';
import { withPrismaReconnect, setMySQLSessionTimeout } from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { quarantine } from '@/lib/dlq';

export interface ActiveRefreshResult {
  batchId: string;
  scanned: number;
  updated: number;
  effectiveBatchSize: number;
  maxScan: number;
  backlogEstimate: number | null;
  stoppedByBudget: boolean;
  durationMs: number;
}

const CONFIGURED_BATCH_SIZE = parsePositiveIntEnv('ACTIVE_REFRESH_BATCH_SIZE', 200);
const DEFAULT_MAX_SCAN_PER_RUN = parsePositiveIntEnv(
  'ACTIVE_REFRESH_MAX_SCAN_PER_RUN',
  5000,
);
const MIN_BATCH_SIZE = parsePositiveIntEnv('ACTIVE_REFRESH_MIN_BATCH_SIZE', 100);
const MAX_BATCH_SIZE = parsePositiveIntEnv('ACTIVE_REFRESH_MAX_BATCH_SIZE', 500);
const FAST_RUN_THRESHOLD_MS = parsePositiveIntEnv(
  'ACTIVE_REFRESH_FAST_RUN_THRESHOLD_MS',
  10_000,
);
const SLOW_RUN_THRESHOLD_MS = parsePositiveIntEnv(
  'ACTIVE_REFRESH_SLOW_RUN_THRESHOLD_MS',
  60_000,
);
const TIMEOUT_MINUTES = parsePositiveIntEnv('ACTIVE_REFRESH_TIMEOUT_MINUTES', 10);
const RUN_BUDGET_MS = parsePositiveIntEnv(
  'ACTIVE_REFRESH_RUN_BUDGET_MS',
  Math.max(5_000, Math.floor(TIMEOUT_MINUTES * 60_000 * 0.8)),
);
const METRICS_KEY = 'active-refresh:metrics';
const RECENT_DURATIONS_KEY = 'active-refresh:durations';
const METRICS_TTL_SECONDS = 24 * 60 * 60;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const REFRESH_CLOSE_STATUS = [
  'CLOSED', 'Closed', 'closed',
  'FINALCHECK', 'Finalcheck', 'finalcheck',
  'MEDIACARE', 'Mediacare', 'mediacare',
  'CLOSE', 'Close', 'close',
];

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Active refresh aborted');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shouldStopForBudget(start: number): boolean {
  return Date.now() - start >= RUN_BUDGET_MS;
}

async function getAdaptiveBatchSize(): Promise<number> {
  if (!isRedisReady()) return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);

  try {
    const [lastDurationRaw, lastStatus, lastEffectiveRaw] = await Promise.all([
      redis.hget(METRICS_KEY, 'lastDurationMs'),
      redis.hget(METRICS_KEY, 'lastStatus'),
      redis.hget(METRICS_KEY, 'lastEffectiveBatchSize'),
    ]);
    const lastDuration = Number.parseInt(lastDurationRaw ?? '', 10);
    const currentBase = lastEffectiveRaw ? Number.parseInt(lastEffectiveRaw, 10) : CONFIGURED_BATCH_SIZE;
    if (!Number.isFinite(lastDuration) || lastStatus !== 'success') {
      return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
    if (lastDuration < FAST_RUN_THRESHOLD_MS) {
      return clamp(Math.ceil(currentBase * 1.25), MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
    if (lastDuration > SLOW_RUN_THRESHOLD_MS) {
      return clamp(Math.floor(currentBase * 0.5), MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
  } catch {
    return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
  }

  return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
}

const BACKLOG_CACHE_KEY = 'active-refresh:backlog';
const BACKLOG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

async function estimateBacklog(today: Date): Promise<number | null> {
  if (isRedisReady()) {
    try {
      const cached = await redis.get(BACKLOG_CACHE_KEY);
      if (cached !== null) {
        return Number(cached);
      }
    } catch { /* fall through */ }
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM ticket t
      WHERE (
          t.sync_date IS NULL
          OR t.sync_date <> ${today}
        )
        AND (
          t.status IS NULL
          OR t.status NOT IN (${Prisma.join(REFRESH_CLOSE_STATUS)})
          OR t.status_update IN ('open', 'assigned', 'on_progress', 'pending')
          OR t.status_update IN ('OPEN', 'ASSIGNED', 'ON_PROGRESS', 'PENDING')
          OR (
            t.pending_dompis IS NOT NULL
            AND t.pending_dompis <> ''
          )
        )
    `;
    const count = Number(rows[0]?.count ?? 0);

    if (isRedisReady()) {
      redis.set(BACKLOG_CACHE_KEY, String(count), 'PX', BACKLOG_CACHE_TTL_MS).catch(() => {});
    }

    return count;
  } catch {
    return null;
  }
}

async function createRunLog(batchId: string, batchSize: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO active_refresh_run_log
      (batchId, status, batchSize, maxScan, startedAt)
    VALUES
      (${batchId}, 'running', ${batchSize}, ${DEFAULT_MAX_SCAN_PER_RUN}, ${nowWib()})
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

async function fetchNotSyncedToday(
  lastTicketId: number | undefined,
  today: Date,
  limit: number,
): Promise<Array<{ id_ticket: number }>> {
  if (limit <= 0) return [];

  return prisma.$queryRaw<Array<{ id_ticket: number }>>`
    SELECT t.id_ticket
    FROM ticket t
    WHERE (t.sync_date IS NULL OR t.sync_date < ${today})
      ${lastTicketId === undefined ? Prisma.empty : Prisma.sql`AND t.id_ticket < ${lastTicketId}`}
    ORDER BY t.id_ticket DESC
    LIMIT ${limit}
  `;
}

async function fetchActiveOpen(
  lastSyncedAt: Date | undefined,
  limit: number,
): Promise<Array<{ id_ticket: number; synced_at: Date | null }>> {
  if (limit <= 0) return [];

  return prisma.$queryRaw<Array<{ id_ticket: number; synced_at: Date | null }>>`
    SELECT t.id_ticket, t.synced_at
    FROM ticket t
    WHERE t.status_update IN ('open', 'assigned', 'on_progress', 'pending',
                              'OPEN', 'ASSIGNED', 'ON_PROGRESS', 'PENDING')
      AND (t.status IS NULL OR t.status NOT IN (${Prisma.join(REFRESH_CLOSE_STATUS)}))
      ${lastSyncedAt === undefined ? Prisma.empty : Prisma.sql`AND (
        t.synced_at < ${lastSyncedAt}
        OR (t.synced_at IS NULL AND ${lastSyncedAt} IS NOT NULL)
      )`}
    ORDER BY t.synced_at DESC
    LIMIT ${limit}
  `;
}

export async function resetStaleAssignedTickets(
  today: Date,
  batchId: string,
  limit: number,
): Promise<number> {
  if (limit <= 0) return 0;

  const rows = await prisma.$queryRaw<Array<{ id_ticket: number }>>`
    SELECT t.id_ticket
    FROM ticket t
    INNER JOIN ticket_tracking tt
      ON tt.ticket_id = t.id_ticket
      AND tt.is_active = TRUE
      AND tt.assigned_at IS NOT NULL
    WHERE t.status_update = 'assigned'
      AND t.teknisi_user_id IS NOT NULL
      AND tt.assigned_at < ${today}
      AND (t.status IS NULL OR t.status NOT IN (${Prisma.join(REFRESH_CLOSE_STATUS)}))
    ORDER BY tt.assigned_at ASC, t.id_ticket ASC
    LIMIT ${limit}
  `;

  const ids = rows.map((row) => row.id_ticket);
  if (ids.length === 0) return 0;

  const now = nowWib();
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { id_ticket: { in: ids } },
      data: {
        teknisi_user_id: null,
        status_update: 'open',
        closed_at: null,
        sync_date: today,
        synced_at: now,
        import_batch: batchId,
      },
    }),
    prisma.ticket_tracking.updateMany({
      where: { ticket_id: { in: ids }, is_active: true },
      data: {
        is_active: false,
        closed_at: now,
        updated_at: now,
      },
    }),
    prisma.ticket_assignment_history.updateMany({
      where: { ticket_id: { in: ids }, is_active: true },
      data: {
        is_active: false,
        unassigned_at: now,
      },
    }),
  ]);

  return ids.length;
}

export async function resetAllStaleAssignedTickets(signal?: AbortSignal): Promise<number> {
  const today = todayWibDateForDb();
  const batchId = `midnight-reset-${Date.now()}`;
  let total = 0;
  while (!signal?.aborted) {
    const count = await resetStaleAssignedTickets(today, batchId, 500);
    if (count === 0) break;
    total += count;
  }
  return total;
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
        OR tr.status NOT IN (${Prisma.join(REFRESH_CLOSE_STATUS)})
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

async function recordMetrics(
  status: 'success' | 'failed' | 'aborted',
  result: ActiveRefreshResult,
  errorMessage?: string,
): Promise<void> {
  if (!isRedisReady()) return;

  try {
    const rowsPerSecond =
      result.durationMs > 0
        ? Math.round((result.updated / result.durationMs) * 1000 * 100) / 100
        : 0;
    await redis
      .multi()
      .hset(METRICS_KEY, {
        lastStatus: status,
        lastBatchId: result.batchId,
        lastScanned: String(result.scanned),
        lastUpdated: String(result.updated),
        lastDurationMs: String(result.durationMs),
        lastRowsPerSecond: String(rowsPerSecond),
        lastEffectiveBatchSize: String(result.effectiveBatchSize),
        lastMaxScan: String(result.maxScan),
        lastBacklogEstimate:
          result.backlogEstimate === null ? '' : String(result.backlogEstimate),
        lastStoppedByBudget: String(result.stoppedByBudget),
        lastError: errorMessage ?? '',
        lastRunAt: new Date().toISOString(),
        ...(status === 'success' && { lastSuccessAt: new Date().toISOString() }),
      })
      .lpush(RECENT_DURATIONS_KEY, String(result.durationMs))
      .ltrim(RECENT_DURATIONS_KEY, 0, 19)
      .expire(METRICS_KEY, METRICS_TTL_SECONDS)
      .expire(RECENT_DURATIONS_KEY, METRICS_TTL_SECONDS)
      .exec();

    const durations = (await redis.lrange(RECENT_DURATIONS_KEY, 0, 19))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (durations.length > 0) {
      const p95Index = Math.min(
        durations.length - 1,
        Math.ceil(durations.length * 0.95) - 1,
      );
      await redis.hset(METRICS_KEY, {
        durationP95Ms: String(durations[p95Index]),
      });
    }
  } catch {
    // Metrics must never fail the refresh path.
  }
}

export async function runActiveRefresh(
  signal?: AbortSignal,
): Promise<ActiveRefreshResult> {
  const start = Date.now();
  const batchId = `active-refresh-${Date.now()}`;
  const today = todayWibDateForDb();
  const effectiveBatchSize = await getAdaptiveBatchSize();
  const result: ActiveRefreshResult = {
    batchId,
    scanned: 0,
    updated: 0,
    effectiveBatchSize,
    maxScan: DEFAULT_MAX_SCAN_PER_RUN,
    backlogEstimate: null,
    stoppedByBudget: false,
    durationMs: 0,
  };

  if (process.env.ACTIVE_REFRESH_ENABLED !== 'true') {
    result.durationMs = Date.now() - start;
    return result;
  }

  result.backlogEstimate = await estimateBacklog(today);
  await setMySQLSessionTimeout(20_000);
  await withPrismaReconnect(() => createRunLog(batchId, effectiveBatchSize));

  try {
    const CURSOR_KEY_TICKET = 'active-refresh:cursor:ticket';
    const CURSOR_KEY_SYNCED = 'active-refresh:cursor:synced';
    const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;

    let lastTicketId: number | undefined;
    let lastSyncedAt: Date | undefined;
    let exhausted = false;

    if (isRedisReady()) {
      try {
        const [ticketRaw, syncedRaw] = await Promise.all([
          redis.get(CURSOR_KEY_TICKET),
          redis.get(CURSOR_KEY_SYNCED),
        ]);
        if (ticketRaw) {
          const parsed = Number(ticketRaw);
          if (Number.isFinite(parsed) && parsed > 0) lastTicketId = parsed;
        }
        if (syncedRaw) {
          const parsed = new Date(syncedRaw);
          if (!Number.isNaN(parsed.getTime())) lastSyncedAt = parsed;
        }
      } catch { /* fall through */ }
    }

    while (
      result.scanned < DEFAULT_MAX_SCAN_PER_RUN &&
      !shouldStopForBudget(start)
    ) {
      assertNotAborted(signal);
      const remaining = DEFAULT_MAX_SCAN_PER_RUN - result.scanned;
      const halfLimit = Math.ceil(Math.min(effectiveBatchSize, remaining) / 2);

      const [unsyncedRows, openRows] = await Promise.all([
        fetchNotSyncedToday(lastTicketId, today, halfLimit),
        fetchActiveOpen(lastSyncedAt, halfLimit),
      ]);

      if (unsyncedRows.length === 0 && openRows.length === 0) {
        exhausted = true;
        break;
      }

      if (unsyncedRows.length > 0) {
        lastTicketId = unsyncedRows[unsyncedRows.length - 1].id_ticket;
      }
      if (openRows.length > 0) {
        const minSynced = openRows
          .filter((r) => r.synced_at !== null)
          .map((r) => r.synced_at as Date)
          .sort((a, b) => b.getTime() - a.getTime())
          .pop();
        if (minSynced) lastSyncedAt = minSynced;
      }

      const allIds = [
        ...new Set([
          ...unsyncedRows.map((r) => r.id_ticket),
          ...openRows.map((r) => r.id_ticket),
        ]),
      ];

      result.scanned += allIds.length;

      const activeIds = await filterRawActiveTicketIds(allIds);

      assertNotAborted(signal);
      if (shouldStopForBudget(start)) break;
      result.updated += await refreshTicketIds(activeIds, batchId);
    }

    result.stoppedByBudget = shouldStopForBudget(start);
    result.durationMs = Date.now() - start;

    if (isRedisReady()) {
      try {
        if (exhausted) {
          await Promise.all([
            redis.del(CURSOR_KEY_TICKET),
            redis.del(CURSOR_KEY_SYNCED),
          ]);
        } else {
          const multi = redis.multi();
          if (lastTicketId !== undefined) {
            multi.set(CURSOR_KEY_TICKET, String(lastTicketId), 'PX', CURSOR_TTL_MS);
          }
          if (lastSyncedAt !== undefined) {
            multi.set(CURSOR_KEY_SYNCED, lastSyncedAt.toISOString(), 'PX', CURSOR_TTL_MS);
          }
          await multi.exec();
        }
      } catch { /* non-critical */ }
    }

    await finishRunLog(batchId, 'success', result);
    await recordMetrics('success', result);
    if (result.updated > 0) {
      await Promise.allSettled([
        invalidateTicketsCache(),
        publishTicketInvalidate('active_refresh'),
      ]);
    }

    // Cleanup stale viewers + broadcast active viewer lists
    try {
      const staleThreshold = new Date(Date.now() - 60_000);
      const staleViewers = await prisma.ticket_active_viewers.deleteMany({
        where: { last_seen_at: { lt: staleThreshold } },
      });
      if (staleViewers.count > 0) {
        logger.info('[ActiveRefresh] Cleaned up stale viewers', { count: staleViewers.count });
      }

      const activeTicketIds = await prisma.ticket_active_viewers.groupBy({
        by: ['ticket_id'],
        where: { last_seen_at: { gte: staleThreshold } },
        _count: { user_id: true },
      });

      for (const group of activeTicketIds) {
        const viewers = await prisma.ticket_active_viewers.findMany({
          where: { ticket_id: group.ticket_id, last_seen_at: { gte: staleThreshold } },
          select: { user_id: true, user_name: true, role: true },
        });
        await publishTicketViewers({
          ticketId: group.ticket_id,
          viewers: viewers.map((v) => ({
            userId: v.user_id,
            userName: v.user_name ?? 'Unknown',
            role: v.role ?? 'unknown',
          })),
          viewerCount: viewers.length,
        }).catch(() => {});
      }
    } catch { /* non-critical */ }

    return result;
  } catch (error) {
    result.durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Active refresh aborted') ? 'aborted' : 'failed';
    await quarantine('active-refresh', { batchId }, error).catch(() => {});
    await finishRunLog(
      batchId,
      status,
      result,
      message,
    ).catch((err) =>
      logger.warn('Failed to finalize run log after error', { component: 'active-refresh', batchId, status, error: err instanceof Error ? err.message : String(err) }),
    );
    await recordMetrics(status, result, message);
    throw error;
  }
}
