import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isRedisReady, redis } from '@/lib/redis';
import {
  getExternalCursorDefinition,
  getExternalPool,
  getTableNames,
} from '@/lib/external-db/connection';
import { ExternalRow, NormalizedExternalRow } from '@/lib/external-db/types';
import {
  normalizeExternalRow,
  normalizeStatus,
} from '@/lib/ingestion/normalizer';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import { broadcastTicketInvalidate, broadcastTicketUpdated, broadcastBridgeFreshness } from '@/app/libs/sseBroadcast';
import { invalidateTicketsCache } from '@/lib/cache';
import { withPrismaReconnect, setMySQLSessionTimeout } from '@/lib/workers/task-runner';
import { PROJECTION_REQUEST_CHANNEL } from '@/lib/worker-signals';
import { logger } from '@/lib/observability/logger';
import { quarantine } from '@/lib/dlq';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { fetchExternalRowsViaBridge } from '@/lib/external-db/qosmic-bridge/status-refresh-adapter';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';

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
  sourceUpdatedAt: Date | null;
  status: string | null;
  status_date: string | null;
  date_modified: string | null;
  worklog_summary: string | null;
  last_update_worklog: string | null;
  sourceHash: string | null;
};

type SeedCandidateRow = {
  incident: string | null;
  sourceTable: string | null;
  status: string | null;
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
  sourceUpdatedAt: Date;
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
const HOT_WINDOW_MINUTES = parsePositiveIntEnv('STATUS_REFRESH_HOT_WINDOW_MINUTES', 15);
const RECHECK_MINUTES = parsePositiveIntEnv('STATUS_REFRESH_RECHECK_MINUTES', 2);
const SEED_BATCH_SIZE = parsePositiveIntEnv('STATUS_REFRESH_SEED_BATCH_SIZE', 150);
const SEED_TIMEOUT_MS = parsePositiveIntEnv('STATUS_REFRESH_SEED_TIMEOUT_MS', 15_000);
const RUN_BUDGET_MS = parsePositiveIntEnv(
  'STATUS_REFRESH_RUN_BUDGET_MS',
  Math.max(5_000, Math.floor(TIMEOUT_MINUTES * 60_000 * 0.8)),
);
const METRICS_KEY = 'status-refresh:metrics';
const RECENT_DURATIONS_KEY = 'status-refresh:durations';
const METRICS_TTL_SECONDS = 24 * 60 * 60;
const UPDATE_CHUNK_SIZE = parsePositiveIntEnv('STATUS_REFRESH_UPDATE_CHUNK_SIZE', 50);
const UPDATE_RETRY_MAX = parsePositiveIntEnv('STATUS_REFRESH_UPDATE_RETRY_MAX', 3);

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

function shouldStopForSeedBudget(start: number): boolean {
  return Date.now() - start >= SEED_TIMEOUT_MS || shouldStopForBudget(start);
}

function getHotWindowStart(): Date {
  return new Date(nowWib().getTime() - HOT_WINDOW_MINUTES * 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withStatusRefreshRetry<T>(
  fn: () => Promise<T>,
  options: {
    label: string;
    retries?: number;
    baseDelayMs?: number;
    failOpen?: boolean;
  },
): Promise<T | null> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 150;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const retryable =
        text.includes('deadlock') ||
        text.includes('lock wait timeout') ||
        text.includes('timeout') ||
        text.includes('p2034') ||
        text.includes('p2024') ||
        text.includes('server has closed the connection') ||
        text.includes('connection pool');

      if (!retryable || attempt >= retries) {
        if (options.failOpen) {
          logger.warn('[StatusRefresh] Fail-open after retry exhaustion', {
            label: options.label,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * baseDelayMs);
      logger.warn('[StatusRefresh] Retrying transient query', {
        label: options.label,
        attempt: attempt + 1,
        retries,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  if (options.failOpen) return null;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isTransientWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('deadlock') ||
    message.includes('write conflict') ||
    message.includes('lock wait timeout') ||
    message.includes('timeout') ||
    message.includes('p2034')
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

function getChangedFields(candidate: CandidateRow, external: ExternalStatusRow): string[] {
  const fields: string[] = [];
  if (candidate.status !== external.normalizedStatus) fields.push('status');
  if (candidate.status_date !== external.statusDate) fields.push('status_date');
  if (candidate.date_modified !== external.dateModified) fields.push('date_modified');
  if (candidate.worklog_summary !== external.worklogSummary) fields.push('worklog_summary');
  if (candidate.last_update_worklog !== external.lastUpdateWorklog) fields.push('last_update_worklog');
  return fields;
}

function mergeSeedCandidates(
  ...rowsList: Array<SeedCandidateRow[] | null | undefined>
): Array<{
  incident: string;
  sourceTable: string;
  status: string | null;
  sourceHash: string | null;
}> {
  const merged = new Map<
    string,
    {
      incident: string;
      sourceTable: string;
      status: string | null;
      sourceHash: string | null;
    }
  >();

  for (const rows of rowsList) {
    for (const candidate of rows ?? []) {
      if (!candidate.incident || !candidate.sourceTable) continue;
      if (merged.has(candidate.incident)) continue;
      merged.set(candidate.incident, {
        incident: candidate.incident,
        sourceTable: candidate.sourceTable,
        status: candidate.status,
        sourceHash: candidate.sourceHash,
      });
    }
  }

  return [...merged.values()];
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
  } catch (error) {
    logger.warn('[StatusRefresh] Adaptive batch size fallback:', { error: String(error) });
    return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
  }

  return clamp(CONFIGURED_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
}

async function estimateBacklog(sourceTables: string[]): Promise<number | null> {
  if (process.env.STATUS_REFRESH_ESTIMATE_BACKLOG !== 'true') return null;

  try {
    const sourceTableFilter = buildSourceTableScopeFilter('tr', sourceTables);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM (
        SELECT tr.id_ticket
        FROM ticket_raw tr
        WHERE tr.incident IS NOT NULL
          AND ${sourceTableFilter}
          AND tr.isActive = TRUE
          LIMIT 5001
      ) x
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

function buildSourceTableScopeFilter(alias: string, sourceTables: string[]): Prisma.Sql {
  const column = Prisma.raw(`${alias}.sourceTable`);
  return sourceTables.length > 0
    ? Prisma.sql`${column} IN (${Prisma.join(sourceTables)})`
    : Prisma.sql`${column} IS NOT NULL`;
}

async function fetchHotCandidates(
  limit: number,
  hotWindowStart: Date,
  sourceTables: string[],
): Promise<CandidateRow[]> {
  if (limit <= 0) return [];

  const sourceTableFilter = buildSourceTableScopeFilter('tr', sourceTables);
  const rows = await withStatusRefreshRetry(
    () => prisma.$queryRaw<CandidateRow[]>`
      SELECT
        tr.id_ticket,
        tr.incident,
        tr.sourceTable,
        tr.sourceUpdatedAt,
        tr.status,
        tr.status_date,
        tr.date_modified,
        tr.worklog_summary,
        tr.last_update_worklog,
        tr.sourceHash
      FROM ticket_raw tr
      LEFT JOIN status_refresh_ticket_state s
        ON s.incident = tr.incident
      WHERE ${sourceTableFilter}
        AND tr.isActive = TRUE
        AND tr.sourceUpdatedAt IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ticket_raw_finalized f WHERE f.incident = tr.incident
        )
        AND tr.sourceUpdatedAt >= ${hotWindowStart}
        AND (
          s.incident IS NULL
          OR s.lastCheckedAt < tr.sourceUpdatedAt
          OR COALESCE(s.lastSourceHash, '') <> COALESCE(tr.sourceHash, '')
        )
      ORDER BY tr.sourceUpdatedAt ASC, tr.id_ticket ASC
      LIMIT ${limit}
    `,
    { label: 'fetchHotCandidates', retries: 2, baseDelayMs: 200, failOpen: false },
  );
  return rows ?? [];
}

async function fetchSafetyCandidates(
  limit: number,
  hotWindowStart: Date,
  sourceTables: string[],
): Promise<CandidateRow[]> {
  if (limit <= 0) return [];

  const recheckBefore = new Date(nowWib().getTime() - RECHECK_MINUTES * 60_000);
  const sourceTableFilter = buildSourceTableScopeFilter('tr', sourceTables);
  const stateTableFilter = buildSourceTableScopeFilter('s', sourceTables);
  const rows = await withStatusRefreshRetry(
    () => prisma.$queryRaw<CandidateRow[]>`
      SELECT
        tr.id_ticket,
        tr.incident,
        tr.sourceTable,
        tr.sourceUpdatedAt,
        tr.status,
        tr.status_date,
        tr.date_modified,
        tr.worklog_summary,
        tr.last_update_worklog,
        tr.sourceHash
      FROM status_refresh_ticket_state s
      INNER JOIN ticket_raw tr ON tr.incident = s.incident
      WHERE ${stateTableFilter}
        AND ${sourceTableFilter}
        AND tr.sourceTable IS NOT NULL
        AND tr.isActive = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM ticket_raw_finalized f WHERE f.incident = tr.incident
        )
        AND s.lastCheckedAt < ${recheckBefore}
        AND (
          tr.sourceUpdatedAt IS NULL
          OR tr.sourceUpdatedAt < ${hotWindowStart}
        )
        AND (
          s.lastCheckedAt < tr.sourceUpdatedAt
          OR COALESCE(s.lastSourceHash, '') <> COALESCE(tr.sourceHash, '')
          OR tr.sourceUpdatedAt IS NULL
        )
      ORDER BY s.lastCheckedAt ASC, tr.id_ticket ASC
      LIMIT ${limit}
    `,
    { label: 'fetchSafetyCandidates', retries: 2, baseDelayMs: 200, failOpen: false },
  );
  return rows ?? [];
}

async function seedRefreshState(limit: number, sourceTables: string[]): Promise<void> {
  const seedStart = Date.now();
  const seedLimit = Math.min(Math.max(limit, SEED_BATCH_SIZE), 200);
  const dueAt = new Date(nowWib().getTime() - RECHECK_MINUTES * 60_000 - 1000);
  const hotWindowStart = getHotWindowStart();
  const sourceTableWhere =
    sourceTables.length > 0
      ? { sourceTable: { in: sourceTables } }
      : { sourceTable: { not: null } };
  const fetchLimit = Math.min(Math.max(seedLimit * 2, seedLimit), 500);

  const datedCandidates = await withStatusRefreshRetry(
    () =>
      prisma.ticket_raw.findMany({
        where: {
          isActive: true,
          incident: { not: null },
          ...sourceTableWhere,
          sourceUpdatedAt: { lt: hotWindowStart, not: null },
        },
        orderBy: [{ sourceUpdatedAt: 'desc' }, { id_ticket: 'asc' }],
        take: fetchLimit,
        select: {
          incident: true,
          sourceTable: true,
          status: true,
          sourceHash: true,
        },
      }),
    { label: 'seedRefreshState.datedCandidates', retries: 1, baseDelayMs: 250, failOpen: true },
  );

  let candidates = mergeSeedCandidates(datedCandidates);
  if (candidates.length < seedLimit && !shouldStopForSeedBudget(seedStart)) {
    const remainingNeed = seedLimit - candidates.length;
    const nullFetchLimit = Math.min(Math.max(remainingNeed * 2, remainingNeed), 300);
    const nullCandidates = await withStatusRefreshRetry(
      () =>
        prisma.ticket_raw.findMany({
          where: {
            isActive: true,
            incident: { not: null },
            ...sourceTableWhere,
            sourceUpdatedAt: null,
          },
          orderBy: [{ lastSeenAt: 'desc' }, { importedAt: 'desc' }, { id_ticket: 'asc' }],
          take: nullFetchLimit,
          select: {
            incident: true,
            sourceTable: true,
            status: true,
            sourceHash: true,
          },
        }),
      { label: 'seedRefreshState.nullCandidates', retries: 1, baseDelayMs: 250, failOpen: true },
    );
    candidates = mergeSeedCandidates(datedCandidates, nullCandidates);
  } else if (candidates.length < seedLimit) {
    logger.info('[StatusRefresh] Seed null scan skipped due to seed budget', {
      seedLimit,
      datedCandidates: candidates.length,
    });
  }

  if (candidates.length === 0) return;

  const recentStateRows = await withStatusRefreshRetry(
    () =>
      prisma.status_refresh_ticket_state.findMany({
        where: {
          incident: { in: candidates.map((c) => c.incident) },
          lastCheckedAt: { gt: dueAt },
        },
        select: {
          incident: true,
        },
      }),
    { label: 'seedRefreshState.stateLookup', retries: 1, baseDelayMs: 200, failOpen: true },
  );

  const recentStateSet = new Set((recentStateRows ?? []).map((row) => row.incident));
  const toSeed = candidates
    .filter((candidate) => !recentStateSet.has(candidate.incident))
    .slice(0, seedLimit);

  if (toSeed.length === 0) return;

  const now = nowWib();
  const rows = toSeed.map(c =>
    Prisma.sql`(${c.incident}, ${c.sourceTable}, ${dueAt}, ${c.status ?? null}, ${c.sourceHash ?? null}, 'seed', 0, ${now})`
  );

  const inserted = await withStatusRefreshRetry(
    () => prisma.$executeRaw`
    INSERT IGNORE INTO status_refresh_ticket_state
      (incident, sourceTable, lastCheckedAt, lastStatus, lastSourceHash, lastBatchId, missingCount, updatedAt)
    VALUES ${Prisma.join(rows)}
  `,
    { label: 'seedRefreshState.insert', retries: 1, baseDelayMs: 250, failOpen: true },
  );
  if (inserted === null) {
    logger.warn('[StatusRefresh] Seed refresh state skipped after transient failures', {
      seedLimit,
    });
  }
}

async function fetchExternalRows(
  sourceTable: string,
  incidents: string[],
): Promise<Map<string, ExternalStatusRow>> {
  if (incidents.length === 0) return new Map();
  assertSafeIdentifier(sourceTable);
  const externalPool = getExternalPool();
  if (!externalPool) throw new Error('External DB pool not available');

  const cursorDefinition = await getExternalCursorDefinition(sourceTable);
  const availableColumns = new Set(
    cursorDefinition.columns.map((column) => column.name),
  );
  const selectedColumns = [
    'incident',
    'status',
    'status_date',
    'worklog_summary',
    'last_update_worklog',
  ].filter((column) => availableColumns.has(column));
  const modifiedColumn =
    ['date_modified', 'datemodified', cursorDefinition.modifiedColumn]
      .filter((column): column is string => Boolean(column))
      .find((column) => availableColumns.has(column)) ?? null;
  if (!selectedColumns.includes('incident')) {
    throw new Error(`External table ${sourceTable} has no incident column`);
  }
  if (modifiedColumn && !selectedColumns.includes(modifiedColumn)) {
    selectedColumns.push(modifiedColumn);
  }
  for (const column of selectedColumns) assertSafeIdentifier(column);

  const placeholders = incidents.map(() => '?').join(',');
  const projection = selectedColumns
    .map((column) => `\`${column}\``)
    .join(', ');
  const [rows] = await externalPool.query(
    `SELECT ${projection} FROM \`${sourceTable}\` WHERE \`incident\` IN (${placeholders})`,
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
      sourceUpdatedAt: parseExternalDate(normalized.date_modified) ?? nowWib(),
    });
  }

  return mapped;
}

async function updateChangedRows(
  changedRows: ExternalStatusRow[],
  batchId: string,
): Promise<number> {
  if (changedRows.length === 0) return 0;
  let updated = 0;
  const sortedRows = [...changedRows].sort((a, b) =>
    a.incident.localeCompare(b.incident),
  );

  for (const chunk of chunkArray(sortedRows, UPDATE_CHUNK_SIZE)) {
    for (let attempt = 0; attempt <= UPDATE_RETRY_MAX; attempt++) {
      try {
        const now = nowWib();
        const today = todayWibDateForDb();
        const values = chunk.map((row) =>
          Prisma.sql`(
            ${row.incident},
            ${row.normalizedStatus},
            ${row.statusDate},
            ${row.dateModified},
            ${row.worklogSummary},
            ${row.lastUpdateWorklog},
            ${row.sourceUpdatedAt},
            ${now},
            ${now},
            ${batchId},
            ${today},
            ${now},
            ${batchId}
          )`,
        );

        const updatedCount = await withStatusRefreshRetry(
          () => prisma.$executeRaw`
          INSERT INTO ticket_raw
            (
              incident,
              status,
              status_date,
              date_modified,
              worklog_summary,
              last_update_worklog,
              sourceUpdatedAt,
              lastSeenAt,
              importedAt,
              syncBatchId,
              sync_date,
              synced_at,
              import_batch
            )
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            status_date = VALUES(status_date),
            date_modified = VALUES(date_modified),
            worklog_summary = VALUES(worklog_summary),
            last_update_worklog = VALUES(last_update_worklog),
            sourceUpdatedAt = VALUES(sourceUpdatedAt),
            lastSeenAt = VALUES(lastSeenAt),
            importedAt = VALUES(importedAt),
            syncBatchId = VALUES(syncBatchId),
            syncVersion = syncVersion + 1,
            isActive = TRUE,
            sync_date = VALUES(sync_date),
            synced_at = VALUES(synced_at),
            import_batch = VALUES(import_batch)
        `,
          { label: 'updateChangedRows', retries: 2, baseDelayMs: 150, failOpen: false },
        );
        if (updatedCount === null) throw new Error('Status refresh update skipped after retries');
        updated += chunk.length;
        break;
      } catch (error) {
        if (attempt >= UPDATE_RETRY_MAX || !isTransientWriteError(error)) {
          throw error;
        }
        await sleep(150 * (attempt + 1));
      }
    }
  }

  return updated;
}

async function batchCloseTickets(
  closedRows: ExternalStatusRow[],
  batchId: string,
): Promise<number> {
  if (closedRows.length === 0) return 0;
  let updated = 0;
  const now = nowWib();

  for (const chunk of chunkArray(closedRows, UPDATE_CHUNK_SIZE)) {
    for (let attempt = 0; attempt <= UPDATE_RETRY_MAX; attempt++) {
      try {
        const values = chunk.map((row) =>
          Prisma.sql`(
            ${row.incident},
            ${row.normalizedStatus},
            'close',
            ${now},
            ${now}
          )`,
        );

        const updatedCount = await withStatusRefreshRetry(
          () => prisma.$executeRaw`
          INSERT INTO ticket
            (incident, status, status_update, closed_at, synced_at)
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            status_update = 'close',
            closed_at = IF(closed_at IS NULL, VALUES(closed_at), closed_at),
            synced_at = VALUES(synced_at)
        `,
          { label: 'batchCloseTickets', retries: 2, baseDelayMs: 150, failOpen: false },
        );
        if (updatedCount === null) throw new Error('Batch close tickets skipped after retries');
        updated += chunk.length;
        break;
      } catch (error) {
        if (attempt >= UPDATE_RETRY_MAX || !isTransientWriteError(error)) {
          throw error;
        }
        await sleep(150 * (attempt + 1));
      }
    }
  }

  logger.info('Batch close tickets complete', {
    batchId,
    closedCount: updated,
    time: nowWib(),
  });

  return updated;
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
        ${candidate.sourceHash},
        ${batchId},
        ${external ? 0 : 1},
        ${now}
      )`;
    });

  const writeResult = await withStatusRefreshRetry(
    () => prisma.$executeRaw`
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
  `,
    { label: 'markChecked', retries: 2, baseDelayMs: 150, failOpen: false },
  );
  if (writeResult === null) throw new Error('Status refresh state update skipped after retries');
}

async function createRunLog(batchId: string, batchSize: number): Promise<void> {
  await withStatusRefreshRetry(() => prisma.$executeRaw`
    INSERT INTO status_refresh_run_log
      (batchId, status, batchSize, startedAt)
    VALUES
      (${batchId}, 'running', ${batchSize}, ${nowWib()})
  `,
    { label: 'createRunLog', retries: 2, baseDelayMs: 200, failOpen: false },
  );
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
  await withStatusRefreshRetry(() => prisma.$executeRaw`
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
  `,
    { label: 'finishRunLog', retries: 2, baseDelayMs: 200, failOpen: true },
  );
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

const PROJECTION_DEBOUNCE_KEY = 'projection:debounce';
const PROJECTION_DEBOUNCE_SECONDS = 30;

async function requestImmediateProjection(syncBatchId: string): Promise<void> {
  if (process.env.STATUS_REFRESH_TRIGGER_PROJECTION === 'false') return;
  if (!isRedisReady()) return;

  // Debounce: hanya publish sekali setiap 30 detik untuk mengurangi flood
  // ke projection worker.
  try {
    const setResult = await redis.set(
      PROJECTION_DEBOUNCE_KEY,
      Date.now().toString(),
      'EX',
      PROJECTION_DEBOUNCE_SECONDS,
      'NX',
    );
    if (setResult !== 'OK') {
      return;
    }
  } catch {
    // Redis error — tetap lanjut (fail-open)
  }

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
  const hotWindowStart = getHotWindowStart();
  const hotLimit = Math.max(1, Math.ceil(effectiveBatchSize * 0.7));
  const safetyLimit = Math.max(1, effectiveBatchSize - hotLimit);
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

  const sourceTables = getTableNames();
  result.backlogEstimate = await estimateBacklog(sourceTables);
  await setMySQLSessionTimeout(60_000);
  await withPrismaReconnect(() => createRunLog(batchId, effectiveBatchSize));

  try {
    await seedRefreshState(effectiveBatchSize, sourceTables).catch((error) =>
      logger.warn('[StatusRefresh] Seed skipped', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    assertNotAborted(signal);
    if (shouldStopForBudget(start)) {
      result.durationMs = Date.now() - start;
      await finishRunLog(batchId, 'success', result);
      await recordMetrics('success', result);
      return result;
    }

    const [hotCandidates, safetyCandidates] = await Promise.all([
      fetchHotCandidates(hotLimit, hotWindowStart, sourceTables),
      fetchSafetyCandidates(safetyLimit, hotWindowStart, sourceTables),
    ]);

    const candidateMap = new Map<string, CandidateRow>();
    for (const candidate of [...hotCandidates, ...safetyCandidates]) {
      if (!candidateMap.has(candidate.incident)) {
        candidateMap.set(candidate.incident, candidate);
      }
    }

    const candidates = [...candidateMap.values()];
    result.scanned = candidates.length;

    const byTable = new Map<string, CandidateRow[]>();
    for (const candidate of candidates) {
      const rows = byTable.get(candidate.sourceTable) ?? [];
      rows.push(candidate);
      byTable.set(candidate.sourceTable, rows);
    }

    const changedRows: ExternalStatusRow[] = [];
    const externalRowsByIncident = new Map<string, ExternalStatusRow>();
    const changedFieldsByIncident = new Map<string, string[]>();
    const processedTables = new Set<string>();
    for (const [sourceTable, tableCandidates] of byTable) {
      assertNotAborted(signal);
      if (shouldStopForBudget(start)) break;

      processedTables.add(sourceTable);
      const BRIDGE_TABLES = new Set(['nossa', 'nossa_closed']);
      const useBridge = BRIDGE_TABLES.has(sourceTable) && isQosmicBridgeConfigured();
      const externalRows = useBridge
        ? await fetchExternalRowsViaBridge(
            sourceTable,
            tableCandidates.map((row) => row.incident),
          )
        : await fetchExternalRows(
            sourceTable,
            tableCandidates.map((row) => row.incident),
          );
      result.fetched += externalRows.size;
      result.missing += tableCandidates.length - externalRows.size;

      for (const candidate of tableCandidates) {
        const external = externalRows.get(candidate.incident);
        if (!external) continue;
        externalRowsByIncident.set(candidate.incident, external);
        const changedFields = getChangedFields(candidate, external);
        if (changedFields.length > 0) {
          changedRows.push(external);
          changedFieldsByIncident.set(candidate.incident, changedFields);
        } else {
          result.unchanged++;
        }
      }
    }

    result.changed = await updateChangedRows(changedRows, batchId);

    // Broadcast per-ticket updates (batch limit to avoid flood)
    if (changedRows.length <= 50) {
      for (const external of changedRows) {
        const fields = changedFieldsByIncident.get(external.incident) ?? [];
        if (fields.length > 0) {
          broadcastTicketUpdated({
            ticketId: external.incident,
            incident: external.incident,
            changedFields: fields,
            source: 'status-refresh',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const closedRows = changedRows.filter((row) =>
      CLOSE_STATUS_VALUES.includes(row.normalizedStatus),
    );
    if (closedRows.length > 0) {
      await batchCloseTickets(closedRows, batchId);
    }

    await markChecked(candidates, externalRowsByIncident, batchId);
    result.durationMs = Date.now() - start;
    await finishRunLog(batchId, 'success', result);
    await recordMetrics('success', result);
    if (result.changed > 0) {
      await requestImmediateProjection(batchId).catch((err) =>
        logger.warn('Failed to request immediate projection', { component: 'status-refresh', batchId, error: err instanceof Error ? err.message : String(err) }),
      );
      await invalidateTicketsCache();
      broadcastTicketInvalidate('status-refresh');
    }
    for (const table of processedTables) {
      if (table === 'nossa' || table === 'nossa_closed') {
        broadcastBridgeFreshness({
          resource: table,
          lastSyncedAt: new Date().toISOString(),
          lagSeconds: 0,
        });
      }
    }
    return result;
  } catch (error) {
    result.durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Status refresh aborted') ? 'aborted' : 'failed';
    await quarantine('status-refresh', { batchId }, error).catch(() => {});
    await finishRunLog(batchId, status, result, message).catch((err) =>
      logger.warn('Failed to finalize run log after error', { component: 'status-refresh', batchId, status, error: err instanceof Error ? err.message : String(err) }),
    );
    await recordMetrics(status, result, message);
    throw error;
  }
}
