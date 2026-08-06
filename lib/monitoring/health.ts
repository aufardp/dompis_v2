import { redis, getRedisStatus, isRedisReady, ensureRedisReady } from '@/lib/redis';
import { getLockStatus } from '@/lib/distributed-lock';
import {
  getSyncHealth,
  getProjectionHealth,
} from '@/lib/sync-metrics/metrics';
import { parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';
import {
  getExternalPool,
  testExternalConnection,
} from '@/lib/external-db/connection';
import { getSloSummary } from '@/lib/observability/slo-tracker';
import { getAllAuditEvents } from '@/lib/observability/audit-trail';
import { getServerConfigWarnings } from '@/lib/observability/config-validator';
import { getQuarantineCount } from '@/lib/dlq';
import { getDLQCounts, getBridgeRateUsage } from '@/lib/external-db/qosmic-bridge/bridge-queue';
import { getOnlineUsers } from '@/lib/monitoring/online-users';
import { prisma } from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';
import {
  getOutboxPendingCount,
  getIngestionQuarantineCount,
} from '@/lib/observability/gauge-counters';

export type HealthSeverity = 'critical' | 'warning' | 'info';
export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface HealthIssue {
  severity: HealthSeverity;
  source: string;
  title: string;
  detail: string;
}

export interface WorkerSnapshot {
  running: boolean;
  pid: string | null;
  lastRunAt: string | null;
  consecutiveErrors: number;
  circuitOpen: boolean;
  lastError: string | null;
  updatedAt: number | null;
  memory: { rss: number; heapUsed: number; heapTotal: number };
}

export interface TaskMetrics {
  lastStatus: string;
  lastBatchId: string;
  lastScanned: number;
  lastFetched: number;
  lastChanged: number;
  lastUnchanged: number;
  lastMissing: number;
  lastDurationMs: number;
  durationP95Ms: number;
  rowsPerSecond: number;
  effectiveBatchSize: number;
  backlogEstimate: number;
  lastError: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}

export interface ExternalDbSnapshot {
  configured: boolean;
  connected: boolean;
  pool: { total: number; active: number; idle: number; queue: number } | null;
}

export interface PipelineSnapshot {
  pendingOutbox: number;
  outboxOldestAgeMs: number | null;
  dlqCounts: Record<string, number>;
  ingestionQuarantine: number;
  bridgeDLQ: { total: number; interactive: number; ingestion: number; backfill: number } | null;
}

export interface SloSnapshot {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  recentError?: string;
}

const THRESHOLDS = {
  dbLatencyWarnMs: 300,
  memoryWarnPct: 75,
  memoryCriticalPct: 90,
  heartbeatProcessStaleMs: 3 * 60_000,
  syncStaleWarnMs: 10 * 60_000,
  projectionStaleWarnMs: 10 * 60_000,
  oldestPendingWarnMs: 5 * 60_000,
  sloSuccessRateWarnPct: 90,
  outboxWarnCount: 50,
  outboxCriticalCount: 1000,
  dlqWarnCount: 50,
  dlqCriticalCount: 200,
  taskBacklogWarnCount: 500,
  statusRefreshMissingWarnCount: 2000,
};

const WORKER_LABELS: Record<string, string> = {
  'data-worker': 'Data Worker',
  'projection-worker': 'Projection',
  'ops-worker': 'Ops',
  'bridge-worker': 'Bridge',
  'snapshot-worker': 'Snapshot',
};

const SLO_LABELS: Record<string, string> = {
  ingestion: 'Ingestion',
  projection: 'Projection',
  status_refresh: 'Status Refresh',
  active_refresh: 'Active Refresh',
  data_worker_cycle: 'Data Worker Cycle',
  'ops-worker': 'Ops',
};

function minutes(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60_000 : fallback * 60_000;
}

const WORKER_INTERVAL_MS: Record<string, number> = {
  'data-worker': minutes(process.env.DATA_WORKER_INTERVAL_MINUTES, 2),
  'projection-worker': minutes(process.env.PROJECTION_INTERVAL_MINUTES, 2),
  'ops-worker': 15 * 60_000,
  'bridge-worker': 15 * 60_000,
  'snapshot-worker': (Number(process.env.SNAPSHOT_INTERVAL_SECONDS ?? 60) || 60) * 1000,
};

function numberFrom(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asStringRecord(value: unknown): Record<string, string> {
  return (value ?? {}) as Record<string, string>;
}

function parseWorkerHeartbeat(row: Record<string, string>): WorkerSnapshot {
  return {
    running: row.running === 'true',
    pid: row.pid || null,
    lastRunAt: row.lastRunAt || null,
    consecutiveErrors: numberFrom(row.consecutiveErrors),
    circuitOpen: row.circuitOpen === 'true',
    lastError: row.lastError || null,
    updatedAt: row.updatedAt ? numberFrom(row.updatedAt) : null,
    memory: {
      rss: numberFrom(row.rss),
      heapUsed: numberFrom(row.heapUsed),
      heapTotal: numberFrom(row.heapTotal),
    },
  };
}

function mapTaskMetrics(row: Record<string, string>): TaskMetrics {
  return {
    lastStatus: row.lastStatus || '',
    lastBatchId: row.lastBatchId || '',
    lastScanned: numberFrom(row.lastScanned),
    lastFetched: numberFrom(row.lastFetched),
    lastChanged: numberFrom(row.lastChanged),
    lastUnchanged: numberFrom(row.lastUnchanged),
    lastMissing: numberFrom(row.lastMissing),
    lastDurationMs: numberFrom(row.lastDurationMs),
    durationP95Ms: numberFrom(row.durationP95Ms),
    rowsPerSecond: numberFrom(row.lastRowsPerSecond),
    effectiveBatchSize: numberFrom(row.lastEffectiveBatchSize),
    backlogEstimate: numberFrom(row.lastBacklogEstimate),
    lastError: row.lastError || '',
    lastRunAt: row.lastRunAt || null,
    lastSuccessAt: row.lastSuccessAt || null,
  };
}

function isoAgeMs(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

function msAge(ts: number | null | undefined): number | null {
  if (!ts || !Number.isFinite(ts)) return null;
  return Math.max(0, Date.now() - ts);
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface HealthInput {
  now: number;
  database: { status: string; latencyMs: number; error?: string };
  redisStatus: string;
  memory: NodeJS.MemoryUsage;
  workers: Record<string, WorkerSnapshot>;
  sync: Awaited<ReturnType<typeof getSyncHealth>> | null;
  projection: Awaited<ReturnType<typeof getProjectionHealth>> | null;
  activeRefresh: TaskMetrics;
  statusRefresh: TaskMetrics;
  slo: Record<string, SloSnapshot>;
  pipeline: PipelineSnapshot;
  externalDb: ExternalDbSnapshot;
  lag: {
    ingestionAgeMs: number | null;
    projectionAgeMs: number | null;
    neverProjected: number | null;
    oldestPendingAgeMs: number | null;
  };
}

function evaluateTask(
  label: string,
  source: string,
  metrics: TaskMetrics,
  issues: HealthIssue[],
  push: (severity: HealthSeverity, source: string, title: string, detail: string) => void,
): void {
  if (!metrics.lastStatus) return;

  if (metrics.lastStatus === 'failed') {
    push(
      'critical',
      source,
      `${label} terakhir gagal`,
      metrics.lastError || `Status run terakhir failed. Cek log worker ${label}.`,
    );
    return;
  }

  if (metrics.lastError) {
    push('warning', source, `${label} melaporkan error`, metrics.lastError);
  }

  if (metrics.backlogEstimate > THRESHOLDS.taskBacklogWarnCount) {
    push(
      'warning',
      source,
      `${label} backlog ${metrics.backlogEstimate}`,
      'Backlog estimasi tinggi — proses refresh tertinggal dari antrian.',
    );
  }

  if (
    source === 'status_refresh' &&
    metrics.lastStatus === 'success' &&
    metrics.lastMissing > THRESHOLDS.statusRefreshMissingWarnCount
  ) {
    push(
      'info',
      source,
      `${label}: ${metrics.lastMissing} tiket missing`,
      'Banyak tiket tidak ditemukan di sumber — kemungkinan sudah closed/dihapus.',
    );
  }
}

export function evaluateHealth(input: HealthInput): {
  status: HealthStatus;
  issues: HealthIssue[];
  summary: { critical: number; warning: number; info: number };
} {
  const issues: HealthIssue[] = [];
  const push = (severity: HealthSeverity, source: string, title: string, detail: string) => {
    issues.push({ severity, source, title, detail });
  };
  const { now } = input;

  // Database
  if (input.database.status !== 'connected') {
    push(
      'critical',
      'database',
      'Database tidak terhubung',
      input.database.error || 'Koneksi DB gagal — cek database server dan pool koneksi.',
    );
  } else if (input.database.latencyMs > THRESHOLDS.dbLatencyWarnMs) {
    push(
      'warning',
      'database',
      `Latensi database tinggi (${input.database.latencyMs} ms)`,
      'Indikasi beban DB atau slow query. Periksa koneksi pool dan query yang berat.',
    );
  }

  // Redis
  if (input.redisStatus !== 'ready') {
    push(
      'critical',
      'redis',
      `Redis tidak siap (${input.redisStatus})`,
      'Cache, lock, heartbeat, dan rate limiter bergantung pada Redis. Periksa service Redis.',
    );
  }

  // Memory API
  const heapTotal = input.memory.heapTotal || 1;
  const heapPct = (input.memory.heapUsed / heapTotal) * 100;
  if (heapPct > THRESHOLDS.memoryCriticalPct) {
    push(
      'critical',
      'api',
      `Heap API ${heapPct.toFixed(0)}%`,
      `Heap ${formatMb(input.memory.heapUsed)} / ${formatMb(heapTotal)}. Pertimbangkan restart proses API atau naikkan NODE_OPTIONS=--max-old-space-size.`,
    );
  } else if (heapPct > THRESHOLDS.memoryWarnPct) {
    push(
      'warning',
      'api',
      `Heap API ${heapPct.toFixed(0)}%`,
      `Heap ${formatMb(input.memory.heapUsed)} / ${formatMb(heapTotal)}. Pantau tren; restart preventif bila terus naik.`,
    );
  }

  // Workers
  for (const [name, worker] of Object.entries(input.workers)) {
    const label = WORKER_LABELS[name] ?? name;
    const interval = WORKER_INTERVAL_MS[name] ?? 10 * 60_000;
    const updatedAge = worker.updatedAt ? now - worker.updatedAt : null;
    const lastRunAge = isoAgeMs(worker.lastRunAt);

    if (worker.circuitOpen) {
      push(
        'critical',
        name,
        `Worker ${label} circuit open`,
        `${worker.consecutiveErrors} error beruntun — proses refresh dihentikan sementara. Periksa log worker dan sumber data.`,
      );
      continue;
    }

    if (worker.consecutiveErrors > 0) {
      push(
        'warning',
        name,
        `Worker ${label} ${worker.consecutiveErrors}x error beruntun`,
        worker.lastError || `Terakhir error ${worker.consecutiveErrors} kali. Cek log worker ${name}.`,
      );
    }

    if (updatedAge !== null && updatedAge > THRESHOLDS.heartbeatProcessStaleMs) {
      push(
        'critical',
        name,
        `Worker ${label} tidak mengirim heartbeat`,
        `Heartbeat terakhir ${Math.round(updatedAge / 1000)}s lalu — proses kemungkinan mati atau stuck. Cek PM2: pm2 status ${name}.`,
      );
    } else if (lastRunAge !== null && lastRunAge > interval * 3) {
      push(
        'warning',
        name,
        `Worker ${label} lama tidak berjalan`,
        `Terakhir berjalan ${Math.round(lastRunAge / 60000)} menit lalu (interval ~${Math.round(interval / 60000)} menit).`,
      );
    } else if (lastRunAge === null && updatedAge !== null) {
      push(
        'info',
        name,
        `Worker ${label} belum pernah berjalan`,
        'Worker hidup tapi belum ada run yang terekam.',
      );
    }
  }

  // Ingestion (sync)
  if (input.sync) {
    if (input.sync.lastSyncStatus === 'failed') {
      push(
        'critical',
        'ingestion',
        'Ingestion terakhir gagal',
        `failed=${input.sync.failedCount}, quarantined=${input.sync.quarantinedCount}. Cek log ingestion dan quarantine.`,
      );
    } else if (
      input.sync.lastSyncStatus !== 'running' &&
      input.lag.ingestionAgeMs !== null &&
      input.lag.ingestionAgeMs > THRESHOLDS.syncStaleWarnMs
    ) {
      push(
        'warning',
        'ingestion',
        'Ingestion terakhir sudah lama',
        `${Math.round(input.lag.ingestionAgeMs / 60000)} menit lalu. Data worker mungkin stuck atau tidak ada perubahan data.`,
      );
    }

    if (input.sync.quarantinedCount > 0) {
      push(
        'warning',
        'ingestion',
        `${input.sync.quarantinedCount} baris ter-quarantine pada ingestion terakhir`,
        'Data bermasalah masuk DLQ — periksa tabel ingestion_quarantine.',
      );
    }
    if (input.sync.failedCount > 0) {
      push(
        'warning',
        'ingestion',
        `${input.sync.failedCount} baris gagal pada ingestion terakhir`,
        'Sebagian data gagal diproses — periksa log ingestion.',
      );
    }
  }

  // Projection
  if (input.projection) {
    if (input.projection.lastProjectionStatus === 'failed') {
      push(
        'critical',
        'projection',
        'Projection terakhir gagal',
        `failed=${input.projection.failedRecords}. Cek log projection worker.`,
      );
    } else if (
      input.projection.lastProjectionStatus !== 'running' &&
      input.lag.projectionAgeMs !== null &&
      input.lag.projectionAgeMs > THRESHOLDS.projectionStaleWarnMs
    ) {
      push(
        'warning',
        'projection',
        'Projection terakhir sudah lama',
        `${Math.round(input.lag.projectionAgeMs / 60000)} menit lalu. Proyeksi data menunggak.`,
      );
    }

    if (input.projection.neverProjectedCount > 0) {
      push(
        'warning',
        'projection',
        `${input.projection.neverProjectedCount} baris belum diproyeksikan`,
        'Backlog proyeksi — raw rows tertunda belum diproses.',
      );
    }
    if (
      input.lag.oldestPendingAgeMs !== null &&
      input.lag.oldestPendingAgeMs > THRESHOLDS.oldestPendingWarnMs
    ) {
      push(
        'warning',
        'projection',
        `Proyeksi tertua ${Math.round(input.lag.oldestPendingAgeMs / 60000)} menit`,
        'Data pending terlalu lama belum diproyeksikan ke tabel proyeksi.',
      );
    }
    if (input.projection.failedRecords > 0) {
      push(
        'warning',
        'projection',
        `${input.projection.failedRecords} record gagal diproyeksikan`,
        'Cek log projection worker.',
      );
    }
  }

  // Status & Active Refresh
  evaluateTask('Status Refresh', 'status_refresh', input.statusRefresh, issues, push);
  evaluateTask('Active Refresh', 'active_refresh', input.activeRefresh, issues, push);

  // SLO (24 jam)
  for (const [name, s] of Object.entries(input.slo)) {
    if (!s.totalRuns || s.failedRuns === 0) continue;
    if (s.successRate < THRESHOLDS.sloSuccessRateWarnPct) {
      push(
        'warning',
        `slo:${name}`,
        `Success rate ${SLO_LABELS[name] ?? name} ${s.successRate}% (24 jam)`,
        `${s.failedRuns} run gagal dari ${s.totalRuns}.${s.recentError ? ` Error terakhir: ${s.recentError.slice(0, 200)}` : ''}`,
      );
    }
  }

  // Pipeline: outbox
  if (input.pipeline.pendingOutbox > THRESHOLDS.outboxCriticalCount) {
    push(
      'critical',
      'outbox',
      `${input.pipeline.pendingOutbox} event outbox pending`,
      'Antrian event outbox menumpuk — dispatcher mungkin bermasalah.',
    );
  } else if (input.pipeline.pendingOutbox > THRESHOLDS.outboxWarnCount) {
    push(
      'warning',
      'outbox',
      `${input.pipeline.pendingOutbox} event outbox pending`,
      input.pipeline.outboxOldestAgeMs
        ? `Event tertua ${Math.round(input.pipeline.outboxOldestAgeMs / 60000)} menit.`
        : 'Antrian outbox mulai menumpuk.',
    );
  }

  // DLQ & quarantine
  for (const [source, count] of Object.entries(input.pipeline.dlqCounts)) {
    if (count > THRESHOLDS.dlqCriticalCount) {
      push(
        'critical',
        `dlq:${source}`,
        `DLQ ${source} berisi ${count} item`,
        'Antrian DLQ besar — lakukan retry atau periksa penyebab kegagalan.',
      );
    } else if (count > THRESHOLDS.dlqWarnCount) {
      push(
        'warning',
        `dlq:${source}`,
        `DLQ ${source} berisi ${count} item`,
        'Item gagal berulang masuk DLQ.',
      );
    }
  }
  if (input.pipeline.ingestionQuarantine > THRESHOLDS.dlqCriticalCount) {
    push(
      'critical',
      'quarantine',
      `${input.pipeline.ingestionQuarantine} baris di ingestion_quarantine`,
      'Banyak baris ter-quarantine — periksa kualitas data source.',
    );
  } else if (input.pipeline.ingestionQuarantine > THRESHOLDS.dlqWarnCount) {
    push(
      'warning',
      'quarantine',
      `${input.pipeline.ingestionQuarantine} baris di ingestion_quarantine`,
      'Data ter-quarantine mulai banyak — periksa normalisasi data.',
    );
  }

  // Bridge DLQ
  if (input.pipeline.bridgeDLQ && input.pipeline.bridgeDLQ.total > 100) {
    push(
      'critical',
      'bridge-dlq',
      `Bridge DLQ total ${input.pipeline.bridgeDLQ.total} (interactive: ${input.pipeline.bridgeDLQ.interactive}, ingestion: ${input.pipeline.bridgeDLQ.ingestion}, backfill: ${input.pipeline.bridgeDLQ.backfill})`,
      'Webhook mungkin down — cek endpoint https://webhookdompis.telkomakses-area3.id/webhook/dompis',
    );
  } else if (input.pipeline.bridgeDLQ && input.pipeline.bridgeDLQ.total > 50) {
    push(
      'warning',
      'bridge-dlq',
      `Bridge DLQ total ${input.pipeline.bridgeDLQ.total}`,
      'Bridge jobs gagal terkirim — monitor webhook endpoint',
    );
  }

  // External DB
  if (input.externalDb.configured && !input.externalDb.connected) {
    push(
      'critical',
      'external-db',
      'External DB (sumber data) tidak terhubung',
      'Semua ingestion dan refresh bergantung pada external DB — periksa koneksi dan credential.',
    );
  }
  if (input.externalDb.pool && input.externalDb.pool.queue > 0) {
    push(
      'warning',
      'external-db',
      `External DB pool mengantri (${input.externalDb.pool.queue})`,
      'Permintaan koneksi menunggu — pertimbangkan naikkan EXTERNAL_DB_CONNECTION_LIMIT.',
    );
  }

  const summary = { critical: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    summary[issue.severity] = (summary[issue.severity] ?? 0) + 1;
  }
  const status: HealthStatus =
    summary.critical > 0 ? 'critical' : summary.warning > 0 ? 'warning' : 'healthy';

  return { status, issues, summary };
}

export interface RedisInfoSnapshot {
  usedMemoryBytes: number;
  usedMemoryHuman: string;
  connectedClients: number;
  evictedKeys: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number | null;
  dbSize: number;
  slowlogCount: number;
}

export async function getRedisInfo(): Promise<RedisInfoSnapshot | null> {
  if (!isRedisReady()) {
    const becameReady = await ensureRedisReady().catch(() => false);
    if (!becameReady) return null;
  }
  try {
    const [info, dbSize, slowlogCount] = await withTimeout(
      Promise.all([
        redis.info(),
        redis.dbsize().catch(() => 0),
        redis.call('SLOWLOG', 'COUNT').catch(() => 0),
      ]),
      3_000,
      ['', 0, 0] as unknown as [string, number, number],
    );
    const lines = String(info).split('\r\n');
    const findNum = (prefix: string): number => {
      const line = lines.find((l) => l.startsWith(prefix));
      const value = line ? Number(line.slice(prefix.length)) : NaN;
      return Number.isFinite(value) ? value : 0;
    };
    const keyspaceHits = findNum('keyspace_hits:');
    const keyspaceMisses = findNum('keyspace_misses:');
    return {
      usedMemoryBytes: findNum('used_memory:'),
      usedMemoryHuman:
        lines.find((l) => l.startsWith('used_memory_human:'))?.slice('used_memory_human:'.length).trim() ?? '',
      connectedClients: findNum('connected_clients:'),
      evictedKeys: findNum('evicted_keys:'),
      keyspaceHits,
      keyspaceMisses,
      hitRate:
        keyspaceHits + keyspaceMisses > 0
          ? keyspaceHits / (keyspaceHits + keyspaceMisses)
          : null,
      dbSize: Number(dbSize),
      slowlogCount: Number(slowlogCount),
    };
  } catch {
    return null;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getHealthSnapshot() {
  const started = Date.now();

  const heartbeatRows = await Promise.all([
    redis.hgetall('worker:heartbeat:data-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:ops-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:bridge-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:snapshot-worker').catch(() => ({})),
  ]);

  const workers: Record<string, WorkerSnapshot> = {};
  const workerNames = ['data-worker', 'projection-worker', 'ops-worker', 'bridge-worker', 'snapshot-worker'] as const;
  for (let i = 0; i < workerNames.length; i++) {
    workers[workerNames[i]] = parseWorkerHeartbeat(asStringRecord(heartbeatRows[i]));
  }

  const [online, sync, projection, activeRefreshMetrics, statusRefreshMetrics, redisInfo] =
    await Promise.all([
      getOnlineUsers(),
      getSyncHealth(),
      getProjectionHealth(),
      redis.hgetall('active-refresh:metrics').catch(() => ({})),
      redis.hgetall('status-refresh:metrics').catch(() => ({})),
      getRedisInfo(),
    ]);

  const [ingestionLock, projectionLock, activeRefreshLock, statusRefreshLock] =
    await Promise.all([
      getLockStatus('ingestion'),
      getLockStatus('projection'),
      getLockStatus('active_refresh'),
      getLockStatus('status_refresh'),
    ]);

  // Database (Prisma)
  let database: { status: string; latencyMs: number; error?: string } = {
    status: 'error',
    latencyMs: 0,
  };
  try {
    const dbStart = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    database = {
      status: 'connected',
      latencyMs: Math.round(performance.now() - dbStart),
    };
  } catch (error) {
    database = {
      status: 'error',
      latencyMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // External DB
  let externalDb: ExternalDbSnapshot;
  try {
    const configured = Boolean(process.env.EXTERNAL_DB_HOST);
    const connected = configured ? await testExternalConnection() : false;
    const pool = configured ? getExternalPool() : null;
    let poolStats: ExternalDbSnapshot['pool'] = null;
    if (pool) {
      try {
        const p = (pool as unknown as {
          pool: {
            totalConnections: number;
            activeConnections: number;
            idleConnections: number;
            queueSize: number;
          };
        }).pool;
        poolStats = {
          total: p.totalConnections,
          active: p.activeConnections,
          idle: p.idleConnections,
          queue: p.queueSize,
        };
      } catch {
        poolStats = null;
      }
    }
    externalDb = { configured, connected, pool: poolStats };
  } catch {
    externalDb = {
      configured: Boolean(process.env.EXTERNAL_DB_HOST),
      connected: false,
      pool: null,
    };
  }

  // Pipeline: outbox
  // COUNT(*) di tabel outbox bisa sangat lambat (backlog membesar) dan sempat
  // menghabiskan connection pool → ganti dengan Redis gauge counter.
  const pendingOutbox = await getOutboxPendingCount();
  let outboxOldestAgeMs: number | null = null;
  try {
    const oldest = await withTimeout(
      prisma.tech_event_outbox.findFirst({
        where: { status: 'PENDING' },
        orderBy: { created_at: 'asc' },
        select: { created_at: true },
      }),
      5_000,
      null,
    );
    outboxOldestAgeMs = oldest
      ? Math.max(0, Date.now() - oldest.created_at.getTime())
      : null;
  } catch {
    // keep null
  }

  const ingestionQuarantine = await getIngestionQuarantineCount();

  const dlqCounts: Record<string, number> = {};
  for (const source of ['projection', 'status-refresh', 'active-refresh']) {
    dlqCounts[source] = await getQuarantineCount(source);
  }

  // Bridge DLQ
  let bridgeDLQ = { total: 0, interactive: 0, ingestion: 0, backfill: 0 };
  try {
    const counts = await getDLQCounts();
    bridgeDLQ = { total: counts.total, interactive: counts.interactive, ingestion: counts.ingestion, backfill: counts.backfill };
  } catch {
    // bridge queue not configured yet — skip silently
  }

  // Bridge rate-limit budget usage (global 14 req/min + backfill 6 req/min)
  let bridgeRate: { global: { used: number; limit: number }; backfill: { used: number; limit: number } } | null = null;
  try {
    bridgeRate = await getBridgeRateUsage();
  } catch {
    bridgeRate = null;
  }

  // SLO summaries
  const sloNames = [
    'ingestion',
    'projection',
    'status_refresh',
    'active_refresh',
    'data_worker_cycle',
    'ops-worker',
  ] as const;
  const slo: Record<string, SloSnapshot> = {};
  for (const name of sloNames) {
    slo[name] = await getSloSummary(name);
  }

  const projectionCheckpointMeta = parseProjectionCheckpointMeta(
    projection.checkpoint ?? null,
  );

  const [auditEvents, configWarnings] = await Promise.all([
    getAllAuditEvents(20).catch(() => []),
    Promise.resolve(getServerConfigWarnings()),
  ]);

  const lag = {
    ingestionAgeMs: msAge(sync.lastSyncTime),
    projectionAgeMs: msAge(projection.lastProjectionTime),
    neverProjected: projectionCheckpointMeta.neverProjected,
    oldestPendingAgeMs: projectionCheckpointMeta.oldestPendingAgeMs,
  };

  const activeRefresh = mapTaskMetrics(asStringRecord(activeRefreshMetrics));
  const statusRefresh = mapTaskMetrics(asStringRecord(statusRefreshMetrics));

  const pipeline: PipelineSnapshot = {
    pendingOutbox,
    outboxOldestAgeMs,
    dlqCounts,
    ingestionQuarantine,
    bridgeDLQ,
  };

  const health = evaluateHealth({
    now: Date.now(),
    database,
    redisStatus: getRedisStatus(),
    memory: process.memoryUsage(),
    workers,
    sync,
    projection,
    activeRefresh,
    statusRefresh,
    slo,
    pipeline,
    externalDb,
    lag,
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - started,
    uptimeSec: Math.round(process.uptime()),
    online,
    system: {
      nodeEnv: process.env.NODE_ENV,
      pid: process.pid,
      memory: process.memoryUsage(),
    },
    database,
    redis: { status: getRedisStatus(), info: redisInfo },
    locks: {
      ingestion: ingestionLock,
      projection: projectionLock,
      activeRefresh: activeRefreshLock,
      statusRefresh: statusRefreshLock,
    },
    workers,
    sync,
    projection,
    activeRefresh,
    statusRefresh,
    externalDb,
    slo,
    pipeline,
    bridgeRate,
    audit: auditEvents,
    configWarnings,
    lag,
    health,
  };
}

export async function sendHealthAlerts(options?: { maxIssues?: number }): Promise<void> {
  try {
    const snapshot = await getHealthSnapshot();
    const maxIssues = options?.maxIssues ?? 8;

    const allCritical = snapshot.health.issues.filter(
      (issue) => issue.severity === 'critical',
    );
    const allWarning = snapshot.health.issues.filter(
      (issue) => issue.severity === 'warning',
    );

    if (allCritical.length === 0 && allWarning.length === 0) return;

    const { sendCriticalAlert, sendWarningAlert } = await import(
      '@/lib/observability/notifier'
    );

    const formatIssue = (issue: HealthIssue): string =>
      `• ${issue.title} — ${issue.detail} (source: ${issue.source})`;

    const buildMessage = (issues: HealthIssue[], total: number): string => {
      const lines = issues.map(formatIssue);
      const omitted = total - issues.length;
      if (omitted > 0) lines.push(`…dan ${omitted} issue lainnya`);
      return lines.join('\n\n');
    };

    const totalIssues = allCritical.length + allWarning.length;

    await Promise.allSettled([
      allCritical.length > 0
        ? sendCriticalAlert(
            `Monitoring: ${allCritical.length} masalah kritis`,
            buildMessage(allCritical, allCritical.length),
            { 'Total issue': totalIssues },
          )
        : Promise.resolve(),
      allWarning.length > 0
        ? sendWarningAlert(
            `Monitoring: ${allWarning.length} peringatan`,
            buildMessage(allWarning, allWarning.length),
            { 'Total issue': totalIssues },
          )
        : Promise.resolve(),
    ]);
  } catch (error) {
    logger.warn('[HealthAlerts] Failed to evaluate/send alerts:', {
      error: String(error),
    });
  }
}
