import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isRedisReady, redis } from '@/lib/redis';
import { getExternalPool } from '@/lib/external-db/connection';
import { ExternalRow, NormalizedExternalRow } from '@/lib/external-db/types';
import {
  computeSourceHash,
  normalizeExternalRow,
  normalizeStatus,
} from '@/lib/ingestion/normalizer';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';

export interface StatusRefreshResult {
  batchId: string;
  scanned: number;
  fetched: number;
  changed: number;
  unchanged: number;
  missing: number;
  effectiveBatchSize: number;
  backlogEstimate: number | null;
  durationMs: number;
}

type CandidateRow = {
  id_ticket: string;
  incident: string;
  sourceTable: string;
  status: string | null;
  status_date: string | null;
  date_modified: string | null;
  worklog_summary: string | null;
  last_update_worklog: string | null;
  sourceHash: string | null;
};

type ExternalStatusRow = {
  incident: string;
  sourceTable: string;
  normalizedStatus: string;
  statusDate: string | null;
  dateModified: string | null;
  worklogSummary: string | null;
  lastUpdateWorklog: string | null;
  sourceHash: string;
  sourceUpdatedAt: Date;
  rawPayload: Prisma.InputJsonValue;
};

const CONFIGURED_BATCH_SIZE = parsePositiveIntEnv('STATUS_REFRESH_BATCH_SIZE', 300);
const MIN_BATCH_SIZE = parsePositiveIntEnv('STATUS_REFRESH_MIN_BATCH_SIZE', 100);
const MAX_BATCH_SIZE = parsePositiveIntEnv('STATUS_REFRESH_MAX_BATCH_SIZE', 800);
const FAST_RUN_THRESHOLD_MS = parsePositiveIntEnv(
  'STATUS_REFRESH_FAST_RUN_THRESHOLD_MS',
  10_000,
);
const SLOW_RUN_THRESHOLD_MS = parsePositiveIntEnv(
  'STATUS_REFRESH_SLOW_RUN_THRESHOLD_MS',
  60_000,
);
const TIMEOUT_MINUTES = parsePositiveIntEnv('STATUS_REFRESH_TIMEOUT_MINUTES', 5);
const RECHECK_MINUTES = parsePositiveIntEnv('STATUS_REFRESH_RECHECK_MINUTES', 2);
const RUN_BUDGET_MS = parsePositiveIntEnv(
  'STATUS_REFRESH_RUN_BUDGET_MS',
  Math.max(5_000, Math.floor(TIMEOUT_MINUTES * 60_000 * 0.8)),
);
const METRICS_KEY = 'status-refresh:metrics';
const RECENT_DURATIONS_KEY = 'status-refresh:durations';
const PROJECTION_REQUEST_CHANNEL = 'worker:projection:request';
const METRICS_TTL_SECONDS = 24 * 60 * 60;

const FINAL_STATUS_VALUES = [
  'closed',
  'Closed',
  'CLOSED',
  'close',
  'Close',
  'CLOSE',
  'resolved',
  'Resolved',
  'RESOLVED',
  'cancelled',
  'Cancelled',
  'CANCELLED',
  'canceled',
  'Canceled',
  'CANCELED',
];

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Status refresh aborted');
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shouldStopForBudget(start: number): boolean {
  return Date.now() - start >= RUN_BUDGET_MS;
}

function trimTo(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? toMySQLDateString(value) : String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function toMySQLDateString(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  const h = String(value.getHours()).padStart(2, '0');
  const min = String(value.getMinutes()).padStart(2, '0');
  const s = String(value.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function parseExternalDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isChanged(candidate: CandidateRow, external: ExternalStatusRow): boolean {
  return (
    candidate.status !== external.normalizedStatus ||
    candidate.status_date !== external.statusDate ||
    candidate.date_modified !== external.dateModified ||
    candidate.worklog_summary !== external.worklogSummary ||
    candidate.last_update_worklog !== external.lastUpdateWorklog ||
    candidate.sourceHash !== external.sourceHash
  );
}

async function getAdaptiveBatchSize(): Promise<number> {
  if (!isRedisReady()) return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);

  try {
    const [lastDurationRaw, lastStatus] = await Promise.all([
      redis.hget(METRICS_KEY, 'lastDurationMs'),
      redis.hget(METRICS_KEY, 'lastStatus'),
    ]);
    const lastDuration = Number.parseInt(lastDurationRaw ?? '', 10);
    if (!Number.isFinite(lastDuration) || lastStatus !== 'success') {
      return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
    if (lastDuration < FAST_RUN_THRESHOLD_MS) {
      return clamp(Math.ceil(CONFIGURED_BATCH_SIZE * 1.25), MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
    if (lastDuration > SLOW_RUN_THRESHOLD_MS) {
      return clamp(Math.floor(CONFIGURED_BATCH_SIZE * 0.5), MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    }
  } catch {
    return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
  }

  return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
}

async function estimateBacklog(): Promise<number | null> {
  if (process.env.STATUS_REFRESH_ESTIMATE_BACKLOG !== 'true') return null;

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM (
        SELECT tr.id_ticket
        FROM ticket_raw tr
        WHERE tr.incident IS NOT NULL
          AND tr.sourceTable IS NOT NULL
          AND tr.isActive = TRUE
          AND (
            tr.status IS NULL
            OR tr.status NOT IN (${Prisma.join(FINAL_STATUS_VALUES)})
          )
        LIMIT 5001
      ) x
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

async function fetchCandidates(limit: number): Promise<CandidateRow[]> {
  const recheckBefore = new Date(nowWib().getTime() - RECHECK_MINUTES * 60_000);
  return prisma.$queryRaw<CandidateRow[]>`
    SELECT
      tr.id_ticket,
      tr.incident,
      tr.sourceTable,
      tr.status,
      tr.status_date,
      tr.date_modified,
      tr.worklog_summary,
      tr.last_update_worklog,
      tr.sourceHash
    FROM ticket_raw tr
    LEFT JOIN status_refresh_ticket_state s ON s.incident = tr.incident
    WHERE tr.incident IS NOT NULL
      AND tr.sourceTable IS NOT NULL
      AND tr.isActive = TRUE
      AND (
        tr.status IS NULL
        OR tr.status NOT IN (${Prisma.join(FINAL_STATUS_VALUES)})
      )
      AND (
        s.lastCheckedAt IS NULL
        OR s.lastCheckedAt < ${recheckBefore}
      )
    ORDER BY
      s.lastCheckedAt ASC,
      tr.synced_at DESC,
      tr.importedAt DESC,
      tr.lastSeenAt DESC,
      tr.id_ticket DESC
    LIMIT ${limit}
  `;
}

async function fetchExternalRows(
  sourceTable: string,
  incidents: string[],
): Promise<Map<string, ExternalStatusRow>> {
  if (incidents.length === 0) return new Map();
  assertSafeIdentifier(sourceTable);
  const externalPool = getExternalPool();
  if (!externalPool) throw new Error('External DB pool not available');

  const placeholders = incidents.map(() => '?').join(',');
  const [rows] = await externalPool.query(
    `SELECT * FROM \`${sourceTable}\` WHERE \`incident\` IN (${placeholders})`,
    incidents,
  );

  const mapped = new Map<string, ExternalStatusRow>();
  for (const rawRow of rows as Record<string, unknown>[]) {
    const normalized = normalizeExternalRow(
      rawRow as unknown as ExternalRow,
      sourceTable,
    ) as NormalizedExternalRow;
    const incident = trimTo(normalized.incident, 50);
    if (!incident) continue;

    mapped.set(incident, {
      incident,
      sourceTable,
      normalizedStatus: normalizeStatus(trimTo(normalized.status, 50)),
      statusDate: trimTo(normalized.status_date, 100),
      dateModified: trimTo(normalized.date_modified, 50),
      worklogSummary: trimTo(normalized.worklog_summary, 100),
      lastUpdateWorklog: trimTo(normalized.last_update_worklog, 100),
      sourceHash: computeSourceHash(normalized),
      sourceUpdatedAt: parseExternalDate(normalized.date_modified) ?? nowWib(),
      rawPayload: normalized._rawPayload as Prisma.InputJsonValue,
    });
  }

  return mapped;
}

async function updateChangedRows(
  changedRows: ExternalStatusRow[],
  batchId: string,
): Promise<number> {
  if (changedRows.length === 0) return 0;
  const now = nowWib();
  const today = todayWibDateForDb();

  await prisma.$transaction(
    changedRows.map((row) =>
      prisma.ticket_raw.update({
        where: { incident: row.incident },
        data: {
          status: row.normalizedStatus,
          status_date: row.statusDate,
          date_modified: row.dateModified,
          worklog_summary: row.worklogSummary,
          last_update_worklog: row.lastUpdateWorklog,
          sourceHash: row.sourceHash,
          sourceUpdatedAt: row.sourceUpdatedAt,
          rawPayload: row.rawPayload,
          lastSeenAt: now,
          importedAt: now,
          syncBatchId: batchId,
          syncVersion: { increment: 1 },
          isActive: true,
          sync_date: today,
          synced_at: now,
          import_batch: batchId,
        },
      }),
    ),
  );

  return changedRows.length;
}

async function markChecked(
  candidates: CandidateRow[],
  externalRowsByIncident: Map<string, ExternalStatusRow>,
  batchId: string,
): Promise<void> {
  if (candidates.length === 0) return;
  const now = nowWib();
  const values = candidates.map((candidate) => {
      const external = externalRowsByIncident.get(candidate.incident);
      return Prisma.sql`(
        ${candidate.incident},
        ${candidate.sourceTable},
        ${now},
        ${external?.normalizedStatus ?? candidate.status},
        ${external?.sourceHash ?? candidate.sourceHash},
        ${batchId},
        ${external ? 0 : 1},
        ${now}
      )`;
    });

  await prisma.$executeRaw`
    INSERT INTO status_refresh_ticket_state
      (
        incident,
        sourceTable,
        lastCheckedAt,
        lastStatus,
        lastSourceHash,
        lastBatchId,
        missingCount,
        updatedAt
      )
    VALUES ${Prisma.join(values)}
    ON DUPLICATE KEY UPDATE
      sourceTable = VALUES(sourceTable),
      lastCheckedAt = VALUES(lastCheckedAt),
      lastStatus = VALUES(lastStatus),
      lastSourceHash = VALUES(lastSourceHash),
      lastBatchId = VALUES(lastBatchId),
      missingCount = IF(VALUES(missingCount) = 0, 0, missingCount + 1),
      updatedAt = VALUES(updatedAt)
  `;
}

async function createRunLog(batchId: string, batchSize: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO status_refresh_run_log
      (batchId, status, batchSize, startedAt)
    VALUES
      (${batchId}, 'running', ${batchSize}, ${nowWib()})
  `;
}

async function finishRunLog(
  batchId: string,
  status: 'success' | 'failed' | 'aborted',
  result: Pick<
    StatusRefreshResult,
    'scanned' | 'fetched' | 'changed' | 'unchanged' | 'missing' | 'durationMs'
  >,
  errorMessage?: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE status_refresh_run_log
    SET
      status = ${status},
      scanned = ${result.scanned},
      fetched = ${result.fetched},
      changed = ${result.changed},
      unchanged = ${result.unchanged},
      missing = ${result.missing},
      durationMs = ${result.durationMs},
      errorMessage = ${errorMessage?.slice(0, 1000) ?? null},
      finishedAt = ${nowWib()}
    WHERE batchId = ${batchId}
  `;
}

async function recordMetrics(
  status: 'success' | 'failed' | 'aborted',
  result: StatusRefreshResult,
  errorMessage?: string,
): Promise<void> {
  if (!isRedisReady()) return;

  try {
    const rowsPerSecond =
      result.durationMs > 0
        ? Math.round((result.fetched / result.durationMs) * 1000 * 100) / 100
        : 0;
    await redis
      .multi()
      .hset(METRICS_KEY, {
        lastStatus: status,
        lastBatchId: result.batchId,
        lastScanned: String(result.scanned),
        lastFetched: String(result.fetched),
        lastChanged: String(result.changed),
        lastUnchanged: String(result.unchanged),
        lastMissing: String(result.missing),
        lastDurationMs: String(result.durationMs),
        lastRowsPerSecond: String(rowsPerSecond),
        lastEffectiveBatchSize: String(result.effectiveBatchSize),
        lastBacklogEstimate:
          result.backlogEstimate === null ? '' : String(result.backlogEstimate),
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
    // Metrics must never block status refresh.
  }
}

async function requestImmediateProjection(syncBatchId: string): Promise<void> {
  if (process.env.STATUS_REFRESH_TRIGGER_PROJECTION === 'false') return;
  if (!isRedisReady()) return;

  await redis.publish(
    PROJECTION_REQUEST_CHANNEL,
    JSON.stringify({
      source: 'status-refresh-worker',
      syncBatchId,
      requestedAt: new Date().toISOString(),
    }),
  );
}

export async function runStatusRefresh(
  signal?: AbortSignal,
): Promise<StatusRefreshResult> {
  const start = Date.now();
  const batchId = `status-refresh-${Date.now()}`;
  const effectiveBatchSize = await getAdaptiveBatchSize();
  const result: StatusRefreshResult = {
    batchId,
    scanned: 0,
    fetched: 0,
    changed: 0,
    unchanged: 0,
    missing: 0,
    effectiveBatchSize,
    backlogEstimate: null,
    durationMs: 0,
  };

  if (process.env.STATUS_REFRESH_ENABLED !== 'true') {
    result.durationMs = Date.now() - start;
    return result;
  }

  result.backlogEstimate = await estimateBacklog();
  await createRunLog(batchId, effectiveBatchSize);

  try {
    assertNotAborted(signal);
    if (shouldStopForBudget(start)) {
      result.durationMs = Date.now() - start;
      await finishRunLog(batchId, 'success', result);
      await recordMetrics('success', result);
      return result;
    }

    const candidates = await fetchCandidates(effectiveBatchSize);
    result.scanned = candidates.length;

    const byTable = new Map<string, CandidateRow[]>();
    for (const candidate of candidates) {
      const rows = byTable.get(candidate.sourceTable) ?? [];
      rows.push(candidate);
      byTable.set(candidate.sourceTable, rows);
    }

    const changedRows: ExternalStatusRow[] = [];
    const externalRowsByIncident = new Map<string, ExternalStatusRow>();
    for (const [sourceTable, tableCandidates] of byTable) {
      assertNotAborted(signal);
      if (shouldStopForBudget(start)) break;

      const externalRows = await fetchExternalRows(
        sourceTable,
        tableCandidates.map((row) => row.incident),
      );
      result.fetched += externalRows.size;
      result.missing += tableCandidates.length - externalRows.size;

      for (const candidate of tableCandidates) {
        const external = externalRows.get(candidate.incident);
        if (!external) continue;
        externalRowsByIncident.set(candidate.incident, external);
        if (isChanged(candidate, external)) {
          changedRows.push(external);
        } else {
          result.unchanged++;
        }
      }
    }

    result.changed = await updateChangedRows(changedRows, batchId);
    await markChecked(candidates, externalRowsByIncident, batchId);
    result.durationMs = Date.now() - start;
    await finishRunLog(batchId, 'success', result);
    await recordMetrics('success', result);
    if (result.changed > 0) {
      await requestImmediateProjection(batchId).catch(() => undefined);
    }
    return result;
  } catch (error) {
    result.durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Status refresh aborted') ? 'aborted' : 'failed';
    await finishRunLog(batchId, status, result, message).catch(() => undefined);
    await recordMetrics(status, result, message);
    throw error;
  }
}
