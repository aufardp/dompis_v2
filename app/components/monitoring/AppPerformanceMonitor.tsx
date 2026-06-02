'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';

type WorkerState = {
  running: boolean;
  pid: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveErrors: number;
  circuitOpen: boolean;
};

type Overview = {
  timestamp: string;
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
    }>;
    windowSeconds: number;
  };
  system: {
    pid: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
  database: { status: string; latencyMs: number; error?: string };
  redis: { status: string };
  workers: Record<string, WorkerState>;
  locks: Record<string, { held: boolean; ttlMs: number | null }>;
  sync: Record<string, number | string | null>;
  projection: Record<string, number | string | null>;
  activeRefresh: Record<string, number | string | null>;
  statusRefresh: Record<string, number | string | null>;
};

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

function statusClass(ok: boolean): string {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300';
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

function WorkerRow({ name, worker, lock }: { name: string; worker: WorkerState; lock?: { held: boolean; ttlMs: number | null } }) {
  const ok = !worker.circuitOpen && worker.consecutiveErrors === 0;
  return (
    <div className='grid grid-cols-2 gap-3 border-b border-(--border) py-3 text-sm last:border-0 md:grid-cols-5'>
      <div className='font-semibold text-(--text-primary)'>{name}</div>
      <div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(ok)}`}>
          {worker.circuitOpen ? 'Circuit open' : worker.running ? 'Running' : 'Idle'}
        </span>
      </div>
      <div className='text-(--text-secondary)'>errors: {worker.consecutiveErrors}</div>
      <div className='text-(--text-secondary)'>lock: {lock?.held ? `held ${lock.ttlMs ?? 0}ms` : 'free'}</div>
      <div className='text-(--text-secondary)'>success: {formatDate(worker.lastSuccessAt)}</div>
    </div>
  );
}

export default function AppPerformanceMonitor() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchWithAuth('/api/monitoring/overview');
        if (!res) return;
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Gagal memuat monitoring');
        if (!cancelled) {
          setData(json);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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

  return (
    <div className='space-y-5'>
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
        <MetricCard
          icon={<HardDrive size={20} />}
          label='Memory API'
          value={formatBytes(data.system.memory.rss)}
          detail={`heap ${heapPercent}% dari ${formatBytes(data.system.memory.heapTotal)}`}
          tone={heapPercent > 85 ? 'bad' : heapPercent > 70 ? 'warn' : 'neutral'}
        />
      </div>

      <div className='grid gap-4 xl:grid-cols-3'>
        <div className='rounded-lg border border-(--border) bg-(--surface) p-4 shadow-sm xl:col-span-2'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <div className='flex items-center gap-2'>
              <Activity size={18} className='text-(--text-secondary)' />
              <h2 className='text-sm font-bold text-(--text-primary)'>Worker Runtime</h2>
            </div>
            <span className='text-xs text-(--text-muted)'>updated {formatDate(data.timestamp)}</span>
          </div>
          <WorkerRow name='Ingestion' worker={data.workers.ingestion} lock={data.locks.ingestion} />
          <WorkerRow name='Projection' worker={data.workers.projection} lock={data.locks.projection} />
          <WorkerRow name='Active Refresh' worker={data.workers.activeRefresh} lock={data.locks.activeRefresh} />
          <WorkerRow name='Status Refresh' worker={data.workers.statusRefresh} lock={data.locks.statusRefresh} />
        </div>

        <div className='rounded-lg border border-(--border) bg-(--surface) p-4 shadow-sm'>
          <div className='mb-3 flex items-center gap-2'>
            <Users size={18} className='text-(--text-secondary)' />
            <h2 className='text-sm font-bold text-(--text-primary)'>Online Detail</h2>
          </div>
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
                    <span className='font-semibold text-(--text-primary)'>#{user.id} {user.role}</span>
                    <span className='text-(--text-muted)'>{formatDate(user.lastSeenAt)}</span>
                  </div>
                  <p className='mt-1 truncate text-xs text-(--text-secondary)'>{user.path}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-4'>
        <MetricCard icon={<RefreshCw size={20} />} label='Ingestion Rows' value={String(data.sync.rowsProcessed ?? 0)} detail={`failed ${data.sync.failedCount ?? 0}`} />
        <MetricCard icon={<ShieldCheck size={20} />} label='Projection Rows' value={String(data.projection.processedRecords ?? 0)} detail={`failed ${data.projection.failedRecords ?? 0}`} />
        <MetricCard icon={<Gauge size={20} />} label='Status Refresh' value={`${data.statusRefresh.lastChanged ?? 0} changed`} detail={`${data.statusRefresh.lastDurationMs ?? 0} ms, ${data.statusRefresh.rowsPerSecond ?? 0} rows/s`} />
        <MetricCard icon={<Clock3 size={20} />} label='Uptime API' value={formatDuration(data.uptimeSec)} detail={`pid ${data.system.pid}`} />
      </div>

      {error && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300'>
          {error}
        </div>
      )}

      <div className='flex items-center gap-2 text-xs text-(--text-muted)'>
        <Server size={14} />
        Refresh otomatis setiap 15 detik. Heartbeat user dikirim setiap 30 detik saat tab aktif.
      </div>
    </div>
  );
}
