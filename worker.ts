import cron, { ScheduledTask } from 'node-cron';
import 'dotenv/config';
import { prisma, connectDB } from '@/app/libs/prisma';
import { redis } from '@/lib/redis';
import { publishSyncEvent } from '@/lib/sse-redis';
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';
import { ClusterAutoAssignServiceV2 } from '@/app/libs/services/clusterAutoAssign.service';
import { sheetsQueue } from '@/lib/worker-queue';
import { dispatchRegulerWebhook } from '@/app/libs/integrations/dispatchRegulerWebhook';
import { retryQuarantinedItems } from '@/lib/ingestion';
import { retryQuarantined as retryIntegrationDlq, getQuarantineSources } from '@/lib/dlq';
import { resetAllStaleAssignedTickets } from '@/lib/active-refresh';
import { fetchTableCount, getTableNames } from '@/lib/external-db/connection';
import { sendWarningAlert, sendCriticalAlert } from '@/lib/observability/notifier';
import {
  withTaskLock,
  withCancellableTimeout,
  createTaskState,
  shouldRunWithCircuitBreaker,
  startWorkerHeartbeat,
  installShutdownHandlers,
  nowWIB,
  runWithCorrelationContext,
  type WorkerTaskState,
} from '@/lib/workers/task-runner';
import { cleanupStaleLock, getLockStatus } from '@/lib/distributed-lock';
import { logger } from '@/lib/observability/logger';
import { logConfigWarnings } from '@/lib/observability/config-validator';
import { recordRun } from '@/lib/observability/slo-tracker';

const MAX_CONSECUTIVE_ERRORS = 5;
const CIRCUIT_RESET_MS = 5 * 60 * 1000;
const AUTO_ASSIGN_SA_BATCH = 20;
const SKIP_IF_DISPATCHED_WITHIN_MS = 60_000;
const WORKER_NAME = 'ops-worker';
const HEARTBEAT_INTERVAL_MS = 30_000;

const TASK_LOCK_CONFIGS = {
  sync:           { ttl: 180, timeout: 3 * 60 * 1000 },
  push:           { ttl: 360, timeout: 5 * 60 * 1000 },
  tech_events:    { ttl: 150, timeout: 2 * 60 * 1000 },
  reguler_webhook: { ttl: 150, timeout: 2 * 60 * 1000 },
  auto_assign:    { ttl: 120, timeout: 2 * 60 * 1000 },
} as const;

const syncState = createTaskState();
const pushState = createTaskState();
const techEventsState = createTaskState();
const regulerWebhookState = createTaskState();
const autoAssignState = createTaskState();

let techEventsLastDispatchAt: number | null = null;

async function runSync(): Promise<void> {
  const state = syncState;
  if (state.running) { logger.info('Sync skipped — previous run still in progress', { component: 'worker', task: 'sync' }); return; }
  if (!shouldRunWithCircuitBreaker(state, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, WORKER_NAME)) {
    logger.warn('Sync circuit open', { component: 'worker', task: 'sync', consecutiveErrors: state.consecutiveErrors });
    return;
  }

  state.running = true;
  state.abortController = new AbortController();
  const startTime = Date.now();
  const cfg = TASK_LOCK_CONFIGS.sync;
  const { controller, signal, cancel } = withCancellableTimeout(cfg.timeout);

  logger.info('Sync starting', { component: 'worker', task: 'sync' });

  try {
    const lockResult = await withTaskLock('sync', cfg.ttl, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');
      const result = await syncSpreadsheet(signal);
      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Sync timed out' });
        return;
      }
      const time = nowWIB();
      logger.info('Sync done', { component: 'worker', task: 'sync', inserted: result.inserted, updated: result.updated, time });
      await publishSyncEvent('complete', { inserted: result.inserted, updated: result.updated });
      await recordRun(WORKER_NAME, Date.now() - startTime, true);
      state.consecutiveErrors = 0;
      state.lastError = null;
    }, { abortController: controller });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error('Sync failed', err, { component: 'worker', task: 'sync' });
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: msg });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function runPush(): Promise<void> {
  const state = pushState;
  if (state.running) { logger.info('Push skipped — previous run still in progress', { component: 'worker', task: 'push' }); return; }
  if (!shouldRunWithCircuitBreaker(state, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, WORKER_NAME)) {
    logger.warn('Push circuit open', { component: 'worker', task: 'push', consecutiveErrors: state.consecutiveErrors });
    return;
  }

  state.running = true;
  state.abortController = new AbortController();
  const startTime = Date.now();
  const cfg = TASK_LOCK_CONFIGS.push;
  const { controller, signal, cancel } = withCancellableTimeout(cfg.timeout);

  logger.info('Push starting', { component: 'worker', task: 'push' });

  try {
    const lockResult = await withTaskLock('push', cfg.ttl, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');
      const result = await pushSpreadsheet(signal);
      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Push timed out' });
        return;
      }
      const time = nowWIB();
      logger.info('Push done', { component: 'worker', task: 'push', updated: result.updated ?? 0, skipped: result.skipped ?? 0, time });
      await publishSyncEvent('complete', { updated: result.updated, skipped: result.skipped });
      await recordRun(WORKER_NAME, Date.now() - startTime, true);
      state.consecutiveErrors = 0;
      state.lastError = null;
    }, { abortController: controller });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error('Push failed', err, { component: 'worker', task: 'push' });
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: msg });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function runTechEvents(): Promise<void> {
  const state = techEventsState;
  if (state.running) { logger.info('Tech events skipped — previous run still in progress', { component: 'worker', task: 'tech_events' }); return; }
  if (Date.now() - (techEventsLastDispatchAt ?? 0) < SKIP_IF_DISPATCHED_WITHIN_MS) return;
  if (!shouldRunWithCircuitBreaker(state, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, WORKER_NAME)) {
    logger.warn('Tech events circuit open', { component: 'worker', task: 'tech_events', consecutiveErrors: state.consecutiveErrors });
    return;
  }

  state.running = true;
  state.abortController = new AbortController();
  const startTime = Date.now();
  const cfg = TASK_LOCK_CONFIGS.tech_events;
  const { controller, signal, cancel } = withCancellableTimeout(cfg.timeout);

  try {
    const lockResult = await withTaskLock('tech_events', cfg.ttl, async () => {
      if (signal.aborted) return;
      const result = await dispatchTechEvents();
      if (!signal.aborted && 'skipped' in result && result.skipped) return;
      if (!signal.aborted) {
        const time = nowWIB();
        logger.info('Tech events done', { component: 'worker', task: 'tech_events', sent: result.success ?? 0, failed: result.failed ?? 0, time });
        await recordRun(WORKER_NAME, Date.now() - startTime, true);
        state.consecutiveErrors = 0;
        state.lastError = null;
        techEventsLastDispatchAt = Date.now();
      }
    }, { abortController: controller });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error('Tech events failed', err, { component: 'worker', task: 'tech_events' });
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: msg });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

let gaugeReconcileRunning = false;

async function runGaugeReconcile(): Promise<void> {
  if (gaugeReconcileRunning) return;
  gaugeReconcileRunning = true;
  try {
    const {
      setOutboxPendingCount,
      setIngestionQuarantineCount,
    } = await import('@/lib/observability/gauge-counters');
    const [outboxPending, quarantine] = await Promise.all([
      prisma.tech_event_outbox
        .count({ where: { status: 'PENDING' } })
        .catch(() => null),
      prisma.ingestion_quarantine.count().catch(() => null),
    ]);
    if (outboxPending !== null) await setOutboxPendingCount(outboxPending);
    if (quarantine !== null) await setIngestionQuarantineCount(quarantine);
  } catch {
    // best-effort — mirror counter tetap dipakai sampai reconcile berikutnya
  } finally {
    gaugeReconcileRunning = false;
  }
}

async function runRegulerWebhook(): Promise<void> {
  const state = regulerWebhookState;
  if (state.running) { logger.info('Reguler webhook skipped — previous run still in progress', { component: 'worker', task: 'reguler_webhook' }); return; }
  if (!shouldRunWithCircuitBreaker(state, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, WORKER_NAME)) {
    logger.warn('Reguler webhook circuit open', { component: 'worker', task: 'reguler_webhook', consecutiveErrors: state.consecutiveErrors });
    return;
  }

  state.running = true;
  state.abortController = new AbortController();
  const startTime = Date.now();
  const cfg = TASK_LOCK_CONFIGS.reguler_webhook;
  const { controller, signal, cancel } = withCancellableTimeout(cfg.timeout);

  try {
    const lockResult = await withTaskLock('reguler_webhook', cfg.ttl, async () => {
      if (signal.aborted) return;
      const result = await dispatchRegulerWebhook();
      if (!signal.aborted && 'skipped' in result && result.skipped) return;
      if (!signal.aborted) {
        const time = nowWIB();
        logger.info('Reguler webhook done', { component: 'worker', task: 'reguler_webhook', success: result.success ?? 0, failed: result.failed ?? 0, time });
        await recordRun(WORKER_NAME, Date.now() - startTime, true);
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    }, { abortController: controller });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error('Reguler webhook failed', err, { component: 'worker', task: 'reguler_webhook' });
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: msg });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function runAutoAssign(): Promise<void> {
  const state = autoAssignState;
  if (state.running) { logger.info('Auto assign skipped — previous run still in progress', { component: 'worker', task: 'auto_assign' }); return; }
  if (!shouldRunWithCircuitBreaker(state, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, WORKER_NAME)) {
    logger.warn('Auto assign circuit open', { component: 'worker', task: 'auto_assign', consecutiveErrors: state.consecutiveErrors });
    return;
  }

  state.running = true;
  state.abortController = new AbortController();
  const startTime = Date.now();
  const cfg = TASK_LOCK_CONFIGS.auto_assign;
  const { controller, signal, cancel } = withCancellableTimeout(cfg.timeout);

  try {
    const lockResult = await withTaskLock('auto_assign', cfg.ttl, async () => {
      if (signal.aborted) return;
      const allSAs = await prisma.service_area.findMany({ select: { id_sa: true } });
      if (allSAs.length === 0) { logger.info('No service areas found for auto assign', { component: 'worker', task: 'auto_assign' }); return; }

      const saIds = allSAs.map((s) => s.id_sa);
      const totalSAs = saIds.length;
      const batchSize = Math.min(AUTO_ASSIGN_SA_BATCH, totalSAs);
      const currentIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % totalSAs;
      const batchSAIds: number[] = [];
      for (let i = 0; i < batchSize; i++) batchSAIds.push(saIds[(currentIdx + i) % totalSAs]);

      if (signal.aborted) return;
      const result = await ClusterAutoAssignServiceV2.runBatchV2(batchSAIds, 0);

      if (!signal.aborted) {
        const time = nowWIB();
        const skipped = result.total - result.assigned - result.failed;
        logger.info('Auto assign done', { component: 'worker', task: 'auto_assign', assigned: result.assigned, total: result.total, skipped, saRange: `${currentIdx + 1}–${currentIdx + batchSize}/${totalSAs}`, time });
        await recordRun(WORKER_NAME, Date.now() - startTime, true);
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    }, { abortController: controller });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error('Auto assign failed', err, { component: 'worker', task: 'auto_assign' });
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: msg });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

let scheduledTasks: ScheduledTask[] = [];
let techEventsSubscriber: ReturnType<typeof redis.duplicate> | null = null;

function isAnyTaskRunning(): boolean {
  return syncState.running || pushState.running || techEventsState.running || regulerWebhookState.running || autoAssignState.running;
}

const dlqRetryState = createTaskState();

async function runDlqRetry(): Promise<void> {
  if (dlqRetryState.running) {
    logger.info('DLQ retry skipped — previous run still in progress', { component: 'worker', task: 'dlq_retry' });
    return;
  }
  dlqRetryState.running = true;
  const startTime = Date.now();
  try {
    const result = await retryQuarantinedItems({ batchSize: 50, maxRetries: 3 });
    if (result.processed > 0) {
      logger.info('DLQ retry done', { component: 'worker', task: 'dlq_retry', processed: result.processed, recovered: result.recovered, failed: result.failed });
    }

    const sources = await getQuarantineSources();
    for (const source of sources) {
      const dlqResult = await retryIntegrationDlq(source, 20);
      if (dlqResult.recovered > 0 || dlqResult.failed > 0) {
        logger.info('Integration DLQ retry', { component: 'worker', task: 'integration_dlq_retry', source, ...dlqResult });
      }
    }
    await recordRun(WORKER_NAME, Date.now() - startTime, true, { processed: result.processed });
  } catch (err: unknown) {
    logger.error('DLQ retry failed', err instanceof Error ? err : new Error(String(err)), { component: 'worker', task: 'dlq_retry' });
  } finally {
    dlqRetryState.running = false;
  }
}

async function monitorBridgeDLQ(): Promise<void> {
  const { getDLQCounts } = await import('@/lib/external-db/qosmic-bridge/bridge-queue');
  try {
    const counts = await getDLQCounts();
    if (counts.total > 0) {
      logger.warn('[BridgeDLQMonitor] Bridge jobs in DLQ', { counts });
    }
  } catch {
    // bridge queue not configured yet — skip silently
  }
}

async function logWorkerHealth(): Promise<void> {
  const lockKeys = ['sync', 'push', 'tech_events', 'auto_assign'] as const;
  const lockStatuses = await Promise.all(lockKeys.map((k) => getLockStatus(k)));

  logger.info('Worker health report', {
    component: 'worker',
    locks: Object.fromEntries(lockKeys.map((k, i) => [k, { held: lockStatuses[i].held, owner: lockStatuses[i].owner }])),
    tasks: {
      sync: { running: syncState.running, lastRunAt: syncState.lastRunAt?.toISOString(), errors: syncState.consecutiveErrors },
      push: { running: pushState.running, lastRunAt: pushState.lastRunAt?.toISOString(), errors: pushState.consecutiveErrors },
      techEvents: { running: techEventsState.running, lastRunAt: techEventsState.lastRunAt?.toISOString(), errors: techEventsState.consecutiveErrors },
      autoAssign: { running: autoAssignState.running, lastRunAt: autoAssignState.lastRunAt?.toISOString(), errors: autoAssignState.consecutiveErrors },
    },
    sheetsQueue: { running: sheetsQueue.isRunning, queueLength: sheetsQueue.queueLength },
  });

  // Alert otomatis berdasarkan aturan health (dashboard + Telegram/Slack).
  // Debounce 15 menit sudah ditangani notifier; best-effort.
  await import('@/lib/monitoring/health').then(({ sendHealthAlerts }) =>
    sendHealthAlerts(),
  );
}

const reconciliationState = createTaskState();

async function runReconciliation(): Promise<void> {
  if (reconciliationState.running) {
    logger.info('Reconciliation skipped — previous run still in progress', { component: 'worker', task: 'reconciliation' });
    return;
  }
  reconciliationState.running = true;
  const startTime = Date.now();

  try {
    const tableNames = getTableNames();
    if (tableNames.length === 0) {
      logger.info('Reconciliation skipped — no external tables configured', { component: 'worker', task: 'reconciliation' });
      return;
    }

    const results: { table: string; external: number; internal: number; diff: number }[] = [];

    for (const tableName of tableNames) {
      const [externalCount, internalCounts] = await Promise.all([
        fetchTableCount(tableName).catch(() => -1),
        prisma.ticket_raw.groupBy({
          by: ['sourceTable'],
          where: { sourceTable: tableName },
          _count: true,
        }).catch(() => []),
      ]);

      const internalCount = internalCounts.length > 0 ? internalCounts[0]!._count : 0;
      const diff = externalCount >= 0 ? externalCount - internalCount : 0;
      results.push({ table: tableName, external: externalCount, internal: internalCount, diff });
    }

    logger.info('Reconciliation complete', {
      component: 'worker',
      task: 'reconciliation',
      tables: results,
      durationMs: Date.now() - startTime,
    });

    const largeDiffs = results.filter(r => r.external >= 0 && Math.abs(r.diff) > 0);
    if (largeDiffs.length > 0) {
      const worstDiff = largeDiffs.reduce((a, b) => Math.abs(a.diff) > Math.abs(b.diff) ? a : b);
      const pct = worstDiff.external > 0 ? Math.round((Math.abs(worstDiff.diff) / worstDiff.external) * 100) : 0;
      if (pct > 10) {
        await sendCriticalAlert(
          `📊 Data Divergence: ${worstDiff.table}`,
          `${worstDiff.table}: external=${worstDiff.external}, internal=${worstDiff.internal}, diff=${worstDiff.diff} (${pct}%)`,
          { table: worstDiff.table, external: worstDiff.external, internal: worstDiff.internal, diff: worstDiff.diff, percentage: `${pct}%` },
        );
      } else {
        await sendWarningAlert(
          `📊 Reconciliation Drift: ${worstDiff.table}`,
          `Minor divergence detected — ${worstDiff.table}: diff=${worstDiff.diff} (${pct}%)`,
          { results: results.map(r => `${r.table}: ext=${r.external} int=${r.internal} diff=${r.diff}`).join(', ') },
        );
      }
    }
  } catch (err: unknown) {
    logger.error('Reconciliation failed', err instanceof Error ? err : new Error(String(err)), { component: 'worker', task: 'reconciliation' });
  } finally {
    reconciliationState.running = false;
  }
}

async function startWorker() {
  const startupDelay = parseInt(process.env.WORKER_STARTUP_DELAY_MS ?? '60000', 10);
  if (startupDelay > 0) {
    logger.info(`Worker startup delay ${startupDelay}ms`, { component: 'worker' });
    await new Promise((r) => setTimeout(r, startupDelay));
  }

  logger.info('Worker starting...', { component: 'worker' });
  logConfigWarnings('ops-worker');

  await connectDB();
  logger.info('DB connected', { component: 'worker' });

  const { connectRedis, isRedisReady } = await import('@/lib/redis');
  if (redis.status !== 'ready') {
    logger.info('Waiting for Redis ready...', { component: 'worker' });
    await connectRedis().catch(() => undefined);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  if (isRedisReady()) {
    techEventsSubscriber = redis.duplicate();
    try {
      await techEventsSubscriber.connect();
      techEventsSubscriber.on('message', (_channel, _message) => {
        void runTechEvents();
      });
      await techEventsSubscriber.subscribe('worker:tech-events:request');
    } catch (err) {
      logger.error('Failed to subscribe to tech-events channel', err, { component: 'worker' });
      techEventsSubscriber = null;
    }
  } else {
    techEventsSubscriber = null;
    logger.warn('Redis not ready — skipping tech-events subscription', { component: 'worker' });
  }

  const lockKeys = ['sync', 'push', 'tech_events', 'auto_assign'] as const;
  for (const lockKey of lockKeys) {
    const cfg = TASK_LOCK_CONFIGS[lockKey];
    await cleanupStaleLock(lockKey, cfg.timeout).catch(() => {});
  }

  const cronEnabled = process.env.CRON_ENABLED === 'true';
  if (!cronEnabled) {
    logger.info('Cron disabled (set CRON_ENABLED=true to enable)', { component: 'worker' });
    return;
  }

  scheduledTasks = [
    cron.schedule('*/2 * * * *', () => runWithCorrelationContext('ops-worker', () => void runTechEvents())),
    cron.schedule('*/2 * * * *', () => runWithCorrelationContext('ops-worker', () => void runGaugeReconcile())),
    cron.schedule('*/15 * * * *', () => runWithCorrelationContext('ops-worker', () => void runRegulerWebhook())),
    cron.schedule('*/5 * * * *', () => runWithCorrelationContext('ops-worker', () => void runAutoAssign())),
    cron.schedule('*/5 * * * *', () => runWithCorrelationContext('ops-worker', () => void runDlqRetry())),
    cron.schedule('*/15 * * * *', () => runWithCorrelationContext('ops-worker', () => void logWorkerHealth())),
    cron.schedule('0 6 * * *', () => runWithCorrelationContext('ops-worker', () => void runReconciliation())),
    cron.schedule('5 0 * * *', () => runWithCorrelationContext('ops-worker', () => void resetAllStaleAssignedTickets())),
    cron.schedule('*/15 * * * *', () => runWithCorrelationContext('ops-worker', () => void monitorBridgeDLQ())),
  ];

  logger.info('Scheduled: tech-events(2m) reguler-webhook(15m) auto-assign(5m) dlq-retry(5m) health(15m) reconciliation(6am) midnight-reset(00:05) bridge-dlq(15m) gauge-reconcile(2m)', { component: 'worker' });

  startWorkerHeartbeat('ops-worker', {
    get running() { return isAnyTaskRunning(); },
    lastRunAt: null,
    lastError: null,
    consecutiveErrors: 0,
    circuitOpenedAt: null,
    abortController: null,
  } as unknown as WorkerTaskState, HEARTBEAT_INTERVAL_MS);

  installShutdownHandlers('ops-worker', scheduledTasks, () => isAnyTaskRunning(), async () => {
    techEventsSubscriber?.quit().catch(() => techEventsSubscriber?.disconnect());
  });
}

startWorker().catch((err) => {
  logger.error('Fatal startup error', err instanceof Error ? err : new Error(String(err)), { component: 'worker' });
  process.exit(1);
});
