import { logger } from '@/lib/observability/logger';
import { isRedisReady, redis } from '@/lib/redis';
import { nowWIB } from '@/lib/workers/task-runner';

const SLO_SLIDING_WINDOW_HOURS = 24;
const SLO_UPTIME_KEY = 'slo:uptime:';
const SLO_LAG_KEY = 'slo:lag:';
const SLO_RUN_KEY = 'slo:runs:';

interface RunRecord {
  ts: number;
  durationMs: number;
  ok: boolean;
  processed?: number;
  quarantined?: number;
  error?: string;
}

interface LagRecord {
  lastSuccessAt: number | null;
  currentLagSeconds: number;
}

function dayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function recordRun(
  workerName: string,
  durationMs: number,
  ok: boolean,
  meta?: { processed?: number; quarantined?: number; error?: string },
): Promise<void> {
  if (!isRedisReady()) return;
  const rec: RunRecord = { ts: Date.now(), durationMs, ok, ...meta };

  await redis
    .multi()
    .rpush(`${SLO_RUN_KEY}${workerName}:${dayKey()}`, JSON.stringify(rec))
    .ltrim(`${SLO_RUN_KEY}${workerName}:${dayKey()}`, -1000, -1)
    .exec()
    .catch((error) => { logger.warn('[SLOTracker] Record failed:', { error: String(error) }); });
}

export async function setLag(workerName: string, lagSeconds: number): Promise<void> {
  if (!isRedisReady()) return;
  const now = Date.now();
  const rec: LagRecord = {
    lastSuccessAt: now,
    currentLagSeconds: lagSeconds,
  };
  await redis.set(`${SLO_LAG_KEY}${workerName}`, JSON.stringify(rec), 'EX', 3600).catch((error) => { logger.warn('[SLOTracker] Record failed:', { error: String(error) }); });
}

export async function getLag(workerName: string): Promise<LagRecord | null> {
  if (!isRedisReady()) return null;
  const raw = await redis.get(`${SLO_LAG_KEY}${workerName}`).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LagRecord;
  } catch {
    return null;
  }
}

export async function getSloSummary(workerName: string, hours: number = SLO_SLIDING_WINDOW_HOURS): Promise<{
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  recentError?: string;
}> {
  if (!isRedisReady()) {
    return { totalRuns: 0, successRuns: 0, failedRuns: 0, successRate: 0, avgDurationMs: 0 };
  }

  const cutoff = Date.now() - hours * 3600_000;
  const keys: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.now() - i * 86400_000);
    const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    keys.push(`${SLO_RUN_KEY}${workerName}:${day}`);
  }

  const allRuns: RunRecord[] = [];
  for (const key of keys) {
    const raw = await redis.lrange(key, 0, -1).catch(() => [] as string[]);
    for (const item of raw) {
      try {
        const r = JSON.parse(item) as RunRecord;
        if (r.ts >= cutoff) allRuns.push(r);
      } catch { /* skip */ }
    }
  }

  const total = allRuns.length;
  if (total === 0) return { totalRuns: 0, successRuns: 0, failedRuns: 0, successRate: 0, avgDurationMs: 0 };

  const succeeded = allRuns.filter(r => r.ok);
  const failed = allRuns.filter(r => !r.ok);
  const avgDuration = Math.round(allRuns.reduce((s, r) => s + r.durationMs, 0) / total);

  return {
    totalRuns: total,
    successRuns: succeeded.length,
    failedRuns: failed.length,
    successRate: Math.round((succeeded.length / total) * 100),
    avgDurationMs: avgDuration,
    recentError: failed.length > 0 ? failed[0]!.error : undefined,
  };
}
