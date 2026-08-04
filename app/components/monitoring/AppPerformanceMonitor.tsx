'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  Inbox,
  Layers,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';

type Severity = 'critical' | 'warning' | 'info';

interface HealthIssue {
  severity: Severity;
  source: string;
  title: string;
  detail: string;
}

interface HealthState {
  status: 'healthy' | 'warning' | 'critical';
  issues: HealthIssue[];
  summary: { critical: number; warning: number; info: number };
}

interface WorkerState {
  running: boolean;
  pid: string | null;
  lastRunAt: string | null;
  consecutiveErrors: number;
  circuitOpen: boolean;
  lastError: string | null;
  updatedAt: number | null;
  memory: { rss: number; heapUsed: number; heapTotal: number };
}

interface TaskMetrics {
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

interface SloSnapshot {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  recentError?: string;
}

interface Overview {
  timestamp: string;
  responseTimeMs?: number;
  uptimeSec: number;
  online: {
    total: number;
    byRole: Record<string, number>;
    users: Array<{
      id: string;
      role: string;
      path: string;
      userAgent: string;
      lastSeenAt: string;
      nama?: string | null;
    }>;
    windowSeconds: number;
  };
  system: {
    nodeEnv: string;
    pid: number;
    memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  };
  database: { status: string; latencyMs: number; error?: string };
  redis: { status: string };
  locks: Record<string, { held: boolean; owner: string | null; ttlMs: number | null }>;
  workers: Record<string, WorkerState>;
  sync: {
    lastSyncTime: number | null;
    lastSyncDuration: number | null;
    lastSyncRowsPerSecond: number | null;
    lastSyncStatus: string;
    rowsProcessed: number;
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    quarantinedCount: number;
    retriedCount: number;
    tableName: string | null;
    checkpoint: string | null;
  };
  projection: {
    lastProjectionTime: number | null;
    lastProjectionDuration: number | null;
    lastProjectionLagMs: number | null;
    lastProjectionRowsPerSecond: number | null;
    lastProjectionStatus: string;
    processedRecords: number;
    failedRecords: number;
    retriedRecords: number;
    protectedRecords: number;
    checkpoint: string | null;
    neverProjectedCount: number;
    oldestPendingAgeMs: number | null;
  };
  activeRefresh: TaskMetrics;
  statusRefresh: TaskMetrics;
  externalDb: {
    configured: boolean;
    connected: boolean;
    pool: { total: number; active: number; idle: number; queue: number } | null;
  };
  slo: Record<string, SloSnapshot>;
  pipeline: {
    pendingOutbox: number;
    outboxOldestAgeMs: number | null;
    dlqCounts: Record<string, number>;
    ingestionQuarantine: number;
  };
  lag: {
    ingestionAgeMs: number | null;
    projectionAgeMs: number | null;
    neverProjected: number | null;
    oldestPendingAgeMs: number | null;
  };
  health: HealthState;
}

type TestAlertState =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'done'; message: string }
  | { state: 'unconfigured'; message: string }
  | { state: 'error'; message: string };

const REFRESH_INTERVAL_MS = 15_000;

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function ageLabel(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined) return '-';
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

function isoAgeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

function msAge(ts: number | null | undefined): number | null {
  if (!ts || !Number.isFinite(ts)) return null;
  return Math.max(0, Date.now() - ts);
}

function statusPill(ok: boolean): string {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300';
}

function neutralPill(): string {
  return 'border-(--border) bg-(--surface-2) text-(--text-secondary)';
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 dark:border-emerald-400/20'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-amber-400/20'
        : tone === 'bad'
          ? 'border-red-200 dark:border-red-400/20'
          : 'border-(--border)';

  return (
    <div className={`rounded-lg border ${toneClass} bg-(--surface) p-4 shadow-sm`}>
      <div className='flex items-center justify-between gap-3'>
        <div className='text-(--text-secondary)'>{icon}</div>
        <span className='text-[10px] font-semibold tracking-wide text-(--text-muted) uppercase'>
          {label}
        </span>
      </div>
      <div className='mt-3 text-2xl font-bold text-(--text-primary)'>{value}</div>
      {detail && <p className='mt-1 text-xs text-(--text-secondary)'>{detail}</p>}
    </div>
  );
}

function Panel({
  icon,
  title,
  right,
  children,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className='rounded-lg border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <div className='text-(--text-secondary)'>{icon}</div>
          <h2 className='text-sm font-bold text-(--text-primary)'>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function HealthBanner({
  health,
  onToggle,
  expanded,
}: {
  health: HealthState;
  onToggle: () => void;
  expanded: boolean;
}) {
  const { status, issues, summary } = health;
  const isHealthy = status === 'healthy';
  const isCritical = status === 'critical';

  const base = isCritical
    ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-100'
    : isHealthy
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100'
      : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100';

  const Icon = isCritical ? AlertTriangle : isHealthy ? CheckCircle2 : AlertCircle;
  const label = isCritical ? 'Kritis' : isHealthy ? 'Sehat' : 'Perlu Perhatian';
  const totalIssues = summary.critical + summary.warning + summary.info;

  return (
    <div className={`rounded-lg border ${base} p-4 shadow-sm`}>
      <div className='flex flex-wrap items-center gap-3'>
        <Icon size={20} className='shrink-0' />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-bold uppercase tracking-wide'>
              Status Kesehatan: {label}
            </span>
            {totalIssues > 0 && (
              <span className='rounded-full border border-current px-2 py-0.5 text-[11px] font-semibold'>
                {summary.critical > 0 && <>{summary.critical} kritis · </>}
                {summary.warning > 0 && <>{summary.warning} perhatian · </>}
                {totalIssues} total
              </span>
            )}
          </div>
          <p className='mt-0.5 text-xs opacity-80'>
            {isHealthy
              ? 'Semua sistem berjalan normal. Tidak ada gejala error terdeteksi.'
              : isCritical
                ? 'Ada masalah kritis yang perlu ditangani segera.'
                : 'Ada beberapa indikator yang perlu diperhatikan.'}
          </p>
        </div>
        {issues.length > 0 && (
          <button
            type='button'
            onClick={onToggle}
            className='rounded-lg border border-current px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80'
          >
            {expanded ? 'Tutup detail' : `Lihat ${issues.length} detail`}
          </button>
        )}
      </div>

      {expanded && issues.length > 0 && (
        <div className='mt-3 space-y-2'>
          {issues.map((issue, index) => (
            <div
              key={`${issue.source}-${index}`}
              className='flex items-start gap-2 rounded-md border border-current/20 bg-white/40 px-3 py-2 text-sm dark:bg-black/10'
            >
              <span
                className={
                  issue.severity === 'critical'
                    ? 'mt-0.5 shrink-0 text-red-600 dark:text-red-400'
                    : issue.severity === 'warning'
                      ? 'mt-0.5 shrink-0 text-amber-600 dark:text-amber-400'
                      : 'mt-0.5 shrink-0 text-slate-400 dark:text-slate-500'
                }
              >
                {issue.severity === 'critical' ? (
                  <AlertTriangle size={14} />
                ) : issue.severity === 'warning' ? (
                  <AlertCircle size={14} />
                ) : (
                  <Info size={14} />
                )}
              </span>
              <div className='min-w-0'>
                <p className='font-semibold'>{issue.title}</p>
                <p className='text-xs opacity-75'>{issue.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <circle cx='12' cy='12' r='10' />
      <path d='M12 16v-4' />
      <path d='M12 8h.01' />
    </svg>
  );
}

function WorkerRow({
  name,
  worker,
  lock,
  slo,
}: {
  name: string;
  worker: WorkerState;
  lock?: { held: boolean; ttlMs: number | null };
  slo?: SloSnapshot;
}) {
  const ok = !worker.circuitOpen && worker.consecutiveErrors === 0;
  const updatedAge = worker.updatedAt ? Date.now() - worker.updatedAt : null;
  const lastRunAge = isoAgeMs(worker.lastRunAt);
  const heapPct =
    worker.memory.heapTotal > 0
      ? Math.round((worker.memory.heapUsed / worker.memory.heapTotal) * 100)
      : 0;

  return (
    <div className='grid grid-cols-2 gap-3 border-b border-(--border) py-3 text-sm last:border-0 md:grid-cols-6'>
      <div className='font-semibold text-(--text-primary)'>{name}</div>
      <div>
        <span
          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
            worker.circuitOpen
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300'
              : worker.running
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300'
                : neutralPill()
          }`}
        >
          {worker.circuitOpen ? 'Circuit open' : worker.running ? 'Running' : 'Idle'}
        </span>
      </div>
      <div className='text-(--text-secondary)'>errors: {worker.consecutiveErrors}</div>
      <div className='text-(--text-secondary)'>
        lock: {lock?.held ? `held ${lock.ttlMs ?? 0}ms` : 'free'}
      </div>
      <div className='text-(--text-secondary)'>
        {lastRunAge === null ? (
          'belum jalan'
        ) : (
          <>
            <span className={lastRunAge > 10 * 60_000 ? 'text-amber-600 dark:text-amber-400' : ''}>
              {ageLabel(lastRunAge)}
            </span>
            {updatedAge !== null && updatedAge > 3 * 60_000 && (
              <span className='block text-red-600 dark:text-red-400'>
                heartbeat mati ({ageLabel(updatedAge)})
              </span>
            )}
          </>
        )}
      </div>
      <div>
        {slo && slo.totalRuns > 0 && (
          <div className='flex items-center gap-2'>
            <span
              className={
                slo.successRate < 90
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'font-semibold text-(--text-primary)'
              }
            >
              {slo.successRate}%
            </span>
            <span className='text-xs text-(--text-muted)'>
              {slo.successRuns}/{slo.totalRuns} ok 24j
            </span>
          </div>
        )}
        {heapPct > 0 && (
          <span className='text-xs text-(--text-muted)'>heap {heapPct}%</span>
        )}
        {worker.lastError && (
          <span className='mt-0.5 block truncate text-xs text-red-600 dark:text-red-400' title={worker.lastError}>
            {worker.lastError}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-(--text-muted)'>{label}</span>
      <span className='font-semibold text-(--text-primary)'>{value}</span>
    </div>
  );
}

function TaskCard({
  name,
  status,
  tone,
  rows,
  footer,
}: {
  name: string;
  status: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  rows: Array<[string, ReactNode]>;
  footer?: ReactNode;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 dark:border-emerald-400/20'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-amber-400/20'
        : tone === 'bad'
          ? 'border-red-200 dark:border-red-400/20'
          : 'border-(--border)';
  const statusClass =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'text-red-600 dark:text-red-400'
          : 'text-(--text-secondary)';

  return (
    <div className={`rounded-lg border ${toneClass} bg-(--surface-2) p-4`}>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <span className='text-xs font-bold tracking-wide text-(--text-muted) uppercase'>
          {name}
        </span>
        <span className={`rounded-full border border-current px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
          {status}
        </span>
      </div>
      <div className='space-y-1.5'>
        {rows.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>
      {footer && <div className='mt-2'>{footer}</div>}
    </div>
  );
}

function statusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'success') return 'good';
  if (status === 'failed') return 'bad';
  if (status === 'running') return 'warn';
  return 'neutral';
}

export default function AppPerformanceMonitor() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testAlert, setTestAlert] = useState<TestAlertState>({ state: 'idle' });
  const intervalRef = useRef<number | null>(null);

  const load = useMemo(
    () => async () => {
      try {
        const res = await fetchWithAuth('/api/monitoring/overview');
        if (!res) return;
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Gagal memuat monitoring');
        setData(json);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const runTestAlert = async () => {
    setTestAlert({ state: 'sending' });
    try {
      const res = await fetchWithAuth('/api/monitoring/test-alert', { method: 'POST' });
      const json = res ? await res.json() : null;
      if (!res?.ok || !json?.success) {
        throw new Error(json?.message || 'Gagal mengirim test alert');
      }
      setTestAlert(
        json.delivered
          ? { state: 'done', message: 'Alert uji terkirim ke Telegram.' }
          : { state: 'unconfigured', message: json.message || 'Kanal alert belum dikonfigurasi.' },
      );
    } catch (err) {
      setTestAlert({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  useEffect(() => {
    void load();

    const tick = () => {
      if (!document.hidden) {
        setRefreshing(true);
        void load();
      }
    };
    intervalRef.current = window.setInterval(tick, REFRESH_INTERVAL_MS);

    const onVisibility = () => {
      setHidden(document.hidden);
      if (!document.hidden) {
        setRefreshing(true);
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const heapPercent = useMemo(() => {
    if (!data?.system.memory.heapTotal) return 0;
    return Math.round((data.system.memory.heapUsed / data.system.memory.heapTotal) * 100);
  }, [data]);

  if (loading && !data) {
    return (
      <div className='rounded-lg border border-(--border) bg-(--surface) p-6 text-sm text-(--text-secondary)'>
        Memuat monitoring aplikasi...
      </div>
    );
  }

  if (!data) {
    return (
      <div className='rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300'>
        {error || 'Monitoring belum tersedia'}
      </div>
    );
  }

  const { health } = data;
  const heapPct = heapPercent;

  return (
    <div className='space-y-5'>
      <HealthBanner health={health} onToggle={() => setIssuesOpen((v) => !v)} expanded={issuesOpen} />

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          icon={<Users size={20} />}
          label='User Online'
          value={String(data.online.total)}
          detail={`window ${data.online.windowSeconds}s`}
          tone='good'
        />
        <MetricCard
          icon={<Database size={20} />}
          label='Database'
          value={data.database.status}
          detail={`${data.database.latencyMs} ms`}
          tone={data.database.status === 'connected' ? 'good' : 'bad'}
        />
        <MetricCard
          icon={<Wifi size={20} />}
          label='Redis'
          value={data.redis.status}
          detail='cache, lock, heartbeat'
          tone={data.redis.status === 'ready' ? 'good' : 'warn'}
        />
        <div className='rounded-lg border border-(--border) bg-(--surface) p-4 shadow-sm'>
          <div className='flex items-center justify-between gap-3'>
            <div className='text-(--text-secondary)'>
              <HardDrive size={20} />
            </div>
            <span className='text-[10px] font-semibold tracking-wide text-(--text-muted) uppercase'>
              Memory API
            </span>
          </div>
          <div className='mt-3 text-2xl font-bold text-(--text-primary)'>
            {formatBytes(data.system.memory.rss)}
          </div>
          <p className='mt-1 text-xs text-(--text-secondary)'>
            heap {heapPct}% dari {formatBytes(data.system.memory.heapTotal)}
          </p>
          <div className='mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--border)'>
            <div
              className={`h-full rounded-full transition-all ${
                heapPct > 85
                  ? 'bg-red-500'
                  : heapPct > 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, heapPct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-3'>
        <div className='xl:col-span-2'>
          <Panel
            icon={<Activity size={18} />}
            title='Worker Runtime'
            right={
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    setRefreshing(true);
                    void load();
                  }}
                  className='flex items-center gap-1 rounded-lg border border-(--border) px-2 py-1 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-2)'
                >
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <span className='text-xs text-(--text-muted)'>{formatDate(data.timestamp)}</span>
              </div>
            }
          >
            <WorkerRow
              name='Data Worker'
              worker={data.workers['data-worker'] ?? emptyWorker}
              lock={data.locks.ingestion}
              slo={data.slo['data_worker_cycle']}
            />
            <WorkerRow
              name='Projection'
              worker={data.workers['projection-worker'] ?? emptyWorker}
              lock={data.locks.projection}
              slo={data.slo['projection']}
            />
            <WorkerRow
              name='Ops'
              worker={data.workers['ops-worker'] ?? emptyWorker}
              slo={data.slo['ops-worker']}
            />
          </Panel>

          <div className='mt-4 grid gap-4 lg:grid-cols-2'>
            <Panel icon={<Layers size={18} />} title='Ingestion' right={<span className='text-xs text-(--text-muted)'>sync metrics</span>}>
              <TaskCard
                name='Last Sync'
                status={data.sync.lastSyncStatus}
                tone={statusTone(data.sync.lastSyncStatus)}
                rows={[
                  ['Diproses', data.sync.rowsProcessed],
                  ['Inserted', data.sync.insertedCount],
                  ['Updated', data.sync.updatedCount],
                  ['Skipped', data.sync.skippedCount],
                  ['Failed', data.sync.failedCount],
                  ['Quarantined', data.sync.quarantinedCount],
                  ['Retried', data.sync.retriedCount],
                ]}
                footer={
                  <div className='space-y-1.5 border-t border-(--border) pt-2'>
                    <Stat label='Durasi' value={`${data.sync.lastSyncDuration ?? 0} ms`} />
                    <Stat label='Rows/s' value={data.sync.lastSyncRowsPerSecond ?? 0} />
                    <Stat label='Tabel' value={data.sync.tableName ?? '-'} />
                    <Stat
                      label='Usia'
                      value={
                        data.lag.ingestionAgeMs !== null ? ageLabel(data.lag.ingestionAgeMs) : '-'
                      }
                    />
                  </div>
                }
              />
            </Panel>

            <Panel icon={<Layers size={18} />} title='Projection' right={<span className='text-xs text-(--text-muted)'>projection metrics</span>}>
              <TaskCard
                name='Last Projection'
                status={data.projection.lastProjectionStatus}
                tone={statusTone(data.projection.lastProjectionStatus)}
                rows={[
                  ['Diproses', data.projection.processedRecords],
                  ['Failed', data.projection.failedRecords],
                  ['Retried', data.projection.retriedRecords],
                  ['Protected', data.projection.protectedRecords],
                  ['Belum diproyeksi', data.projection.neverProjectedCount],
                  ['Lag', `${data.projection.lastProjectionLagMs ?? 0} ms`],
                ]}
                footer={
                  <div className='space-y-1.5 border-t border-(--border) pt-2'>
                    <Stat label='Durasi' value={`${data.projection.lastProjectionDuration ?? 0} ms`} />
                    <Stat label='Rows/s' value={data.projection.lastProjectionRowsPerSecond ?? 0} />
                    <Stat
                      label='Tertua pending'
                      value={
                        data.projection.oldestPendingAgeMs !== null
                          ? ageLabel(data.projection.oldestPendingAgeMs)
                          : '-'
                      }
                    />
                    <Stat
                      label='Usia'
                      value={
                        data.lag.projectionAgeMs !== null
                          ? ageLabel(data.lag.projectionAgeMs)
                          : '-'
                      }
                    />
                  </div>
                }
              />
            </Panel>
          </div>
        </div>

        <div className='space-y-4'>
          <Panel icon={<Users size={18} />} title='Online Detail'>
            <div className='mb-3 flex flex-wrap gap-2'>
              {Object.entries(data.online.byRole).map(([role, count]) => (
                <span key={role} className='rounded-full border border-(--border) px-2 py-1 text-xs text-(--text-secondary)'>
                  {role}: {count}
                </span>
              ))}
            </div>
            <div className='max-h-72 space-y-2 overflow-auto'>
              {data.online.users.length === 0 ? (
                <p className='text-sm text-(--text-secondary)'>Belum ada user aktif.</p>
              ) : (
                data.online.users.map((user) => (
                  <div key={user.id} className='rounded-md border border-(--border) bg-(--surface-2) p-2'>
                    <div className='flex items-center justify-between gap-2 text-xs'>
                      <span className='font-semibold text-(--text-primary)'>{user.nama || user.role}</span>
                      <span className='text-(--text-muted)'>{formatDate(user.lastSeenAt)}</span>
                    </div>
                    <p className='mt-1 truncate text-xs text-(--text-secondary)'>{user.path}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel icon={<Gauge size={18} />} title='Status & Active Refresh'>
            <TaskCard
              name='Status Refresh'
              status={data.statusRefresh.lastStatus || 'never'}
              tone={statusTone(data.statusRefresh.lastStatus)}
              rows={[
                ['Scanned', data.statusRefresh.lastScanned],
                ['Fetched', data.statusRefresh.lastFetched],
                ['Changed', data.statusRefresh.lastChanged],
                ['Missing', data.statusRefresh.lastMissing],
                ['Backlog', data.statusRefresh.backlogEstimate],
                ['Durasi', `${data.statusRefresh.lastDurationMs} ms`],
              ]}
              footer={
                data.statusRefresh.lastError ? (
                  <p className='truncate text-xs text-red-600 dark:text-red-400' title={data.statusRefresh.lastError}>
                    {data.statusRefresh.lastError}
                  </p>
                ) : (
                  <div className='space-y-1.5 border-t border-(--border) pt-2'>
                    <Stat label='Rows/s' value={data.statusRefresh.rowsPerSecond} />
                    <Stat label='p95' value={`${data.statusRefresh.durationP95Ms} ms`} />
                    <Stat label='Batch efektif' value={data.statusRefresh.effectiveBatchSize} />
                  </div>
                )
              }
            />
            <div className='mt-3'>
              <TaskCard
                name='Active Refresh'
                status={data.activeRefresh.lastStatus || 'never'}
                tone={statusTone(data.activeRefresh.lastStatus)}
                rows={[
                  ['Scanned', data.activeRefresh.lastScanned],
                  ['Changed', data.activeRefresh.lastChanged],
                  ['Backlog', data.activeRefresh.backlogEstimate],
                  ['Durasi', `${data.activeRefresh.lastDurationMs} ms`],
                ]}
                footer={
                  data.activeRefresh.lastError ? (
                    <p className='truncate text-xs text-red-600 dark:text-red-400' title={data.activeRefresh.lastError}>
                      {data.activeRefresh.lastError}
                    </p>
                  ) : (
                    <div className='space-y-1.5 border-t border-(--border) pt-2'>
                      <Stat label='Rows/s' value={data.activeRefresh.rowsPerSecond} />
                      <Stat label='p95' value={`${data.activeRefresh.durationP95Ms} ms`} />
                      <Stat label='Batch efektif' value={data.activeRefresh.effectiveBatchSize} />
                    </div>
                  )
                }
              />
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        icon={<Server size={18} />}
        title='System & Integrasi'
        right={
          <div className='flex items-center gap-3'>
            {testAlert.state !== 'idle' && (
              <span
                className={`max-w-56 text-right text-xs ${
                  testAlert.state === 'done'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : testAlert.state === 'unconfigured'
                      ? 'text-amber-600 dark:text-amber-400'
                      : testAlert.state === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-(--text-muted)'
                }`}
              >
                {testAlert.state === 'sending'
                  ? 'Mengirim alert uji...'
                  : testAlert.message}
              </span>
            )}
            <button
              type='button'
              onClick={() => void runTestAlert()}
              disabled={testAlert.state === 'sending'}
              className='flex shrink-0 items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text-primary) transition-colors hover:bg-(--surface-2) disabled:opacity-50'
            >
              <Send size={12} />
              Test Alert
            </button>
            <span className='text-xs text-(--text-muted)'>
              response {data.responseTimeMs ?? 0} ms
            </span>
          </div>
        }
      >
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <div className='rounded-lg border border-(--border) bg-(--surface-2) p-4'>
            <p className='text-[10px] font-bold tracking-wide text-(--text-muted) uppercase'>External DB</p>
            <p
              className={`mt-1 text-lg font-bold ${
                !data.externalDb.configured
                  ? 'text-(--text-secondary)'
                  : data.externalDb.connected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {!data.externalDb.configured
                ? 'Tidak dikonfigurasi'
                : data.externalDb.connected
                  ? 'Terhubung'
                  : 'Terputus'}
            </p>
            {data.externalDb.pool && (
              <p className='mt-1 text-xs text-(--text-secondary)'>
                pool {data.externalDb.pool.active}/{data.externalDb.pool.total} aktif · antri{' '}
                {data.externalDb.pool.queue}
              </p>
            )}
          </div>

          <div className='rounded-lg border border-(--border) bg-(--surface-2) p-4'>
            <div className='flex items-center justify-between'>
              <p className='text-[10px] font-bold tracking-wide text-(--text-muted) uppercase'>Outbox Pending</p>
              <Inbox size={14} className='text-(--text-muted)' />
            </div>
            <p
              className={`mt-1 text-lg font-bold ${
                data.pipeline.pendingOutbox > 1000
                  ? 'text-red-600 dark:text-red-400'
                  : data.pipeline.pendingOutbox > 50
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-(--text-primary)'
              }`}
            >
              {data.pipeline.pendingOutbox}
            </p>
            <p className='mt-1 text-xs text-(--text-secondary)'>
              {data.pipeline.outboxOldestAgeMs !== null
                ? `tertua ${ageLabel(data.pipeline.outboxOldestAgeMs)}`
                : 'antrian kosong'}
            </p>
          </div>

          <div className='rounded-lg border border-(--border) bg-(--surface-2) p-4'>
            <p className='text-[10px] font-bold tracking-wide text-(--text-muted) uppercase'>
              Quarantine / DLQ
            </p>
            <div className='mt-1 space-y-1'>
              <p className='text-sm text-(--text-primary)'>
                ingestion_quarantine:{' '}
                <span className='font-bold'>{data.pipeline.ingestionQuarantine}</span>
              </p>
              {Object.entries(data.pipeline.dlqCounts).map(([source, count]) => (
                <p key={source} className='text-sm text-(--text-primary)'>
                  {source}: <span className='font-bold'>{count}</span>
                </p>
              ))}
            </div>
          </div>

          <div className='rounded-lg border border-(--border) bg-(--surface-2) p-4'>
            <p className='text-[10px] font-bold tracking-wide text-(--text-muted) uppercase'>
              SLO 24 Jam (success rate)
            </p>
            <div className='mt-1 space-y-1'>
              {(['ingestion', 'projection', 'status_refresh', 'active_refresh'] as const).map((key) => {
                const s = data.slo[key];
                if (!s || s.totalRuns === 0) {
                  return (
                    <p key={key} className='text-sm text-(--text-secondary)'>
                      {key.replace('_', ' ')}: <span className='font-bold'>-</span>
                    </p>
                  );
                }
                return (
                  <p key={key} className='text-sm text-(--text-primary)'>
                    {key.replace('_', ' ')}:{' '}
                    <span className={`font-bold ${s.successRate < 90 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {s.successRate}%
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-4'>
        <MetricCard icon={<Clock3 size={20} />} label='Uptime API' value={formatDuration(data.uptimeSec)} detail={`pid ${data.system.pid}`} />
        <MetricCard icon={<Gauge size={20} />} label='Ingestion Rows' value={String(data.sync.rowsProcessed)} detail={`failed ${data.sync.failedCount}`} tone={data.sync.failedCount > 0 ? 'warn' : 'neutral'} />
        <MetricCard icon={<ShieldCheck size={20} />} label='Projection Records' value={String(data.projection.processedRecords)} detail={`failed ${data.projection.failedRecords}`} tone={data.projection.failedRecords > 0 ? 'warn' : 'neutral'} />
        <MetricCard icon={<RefreshCw size={20} />} label='Auto Refresh' value={hidden ? 'Paused' : '5 detik'} detail='pause saat tab tidak aktif' />
      </div>

      {error && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300'>
          {error}
        </div>
      )}

      <div className='flex items-center gap-2 text-xs text-(--text-muted)'>
        <Server size={14} />
        Refresh otomatis setiap 5 detik ({hidden ? 'dihentikan saat tab tidak aktif' : 'aktif'}). Heartbeat user dikirim setiap 30 detik saat tab aktif. Klik issue pada banner untuk panduan pencegahan.
      </div>
    </div>
  );
}

const emptyWorker: WorkerState = {
  running: false,
  pid: null,
  lastRunAt: null,
  consecutiveErrors: 0,
  circuitOpen: false,
  lastError: null,
  updatedAt: null,
  memory: { rss: 0, heapUsed: 0, heapTotal: 0 },
};
