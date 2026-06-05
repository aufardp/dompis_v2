'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Clock3, Flame, MoonStar, SunMedium } from 'lucide-react';
import { toZonedTime, format } from 'date-fns-tz';
import { ChartContainer, ChartTooltipContent } from '@/app/components/ui/chart';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

type HourlyCloseRow = {
  hour: number;
  count: number;
};

const ALL_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: `${String(hour).padStart(2, '0')}:00`,
  shortLabel: String(hour).padStart(2, '0'),
  count: 0,
}));

const WIB_TIMEZONE = 'Asia/Jakarta';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function getWibNow(): Date {
  return toZonedTime(new Date(), WIB_TIMEZONE);
}

function getHourBadge(hour: number): string {
  if (hour >= 5 && hour <= 10) return 'Pagi';
  if (hour >= 11 && hour <= 15) return 'Siang';
  if (hour >= 16 && hour <= 18) return 'Sore';
  return 'Malam';
}

function getBarFill(hour: number, count: number, currentHour: number, peakHour: number | null): string {
  if (count === 0) return 'rgba(148, 163, 184, 0.20)';
  if (peakHour === hour) return '#10b981';
  if (currentHour === hour) return '#f59e0b';
  if (count >= 8) return '#38bdf8';
  if (count >= 4) return '#60a5fa';
  return '#7c3aed';
}

function StatPill({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
          {label}
        </p>
        <div className="text-(--text-muted)">{icon}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-lg font-bold leading-none text-(--text-primary)">{value}</p>
        <p className="text-right text-[11px] leading-tight text-(--text-secondary)">{sub}</p>
      </div>
    </div>
  );
}

function HourChip({
  hour,
  count,
  currentHour,
  peakHour,
}: {
  hour: number;
  count: number;
  currentHour: number;
  peakHour: number | null;
}) {
  const active = count > 0;
  const isCurrent = hour === currentHour;
  const isPeak = hour === peakHour;

  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center"
      style={{
        borderColor: isPeak
          ? 'rgba(16, 185, 129, 0.35)'
          : isCurrent
            ? 'rgba(245, 158, 11, 0.35)'
            : 'var(--border)',
        background: isPeak
          ? 'rgba(16, 185, 129, 0.08)'
          : isCurrent
            ? 'rgba(245, 158, 11, 0.08)'
            : 'var(--surface-2)',
      }}
    >
      <span className="text-[10px] font-semibold text-(--text-muted)">
        {String(hour).padStart(2, '0')}
      </span>
      <div
        className="w-full rounded-full"
        style={{
          height: `${Math.max(6, Math.min(28, count * 3))}px`,
          background: active
            ? isPeak
              ? '#10b981'
              : isCurrent
                ? '#f59e0b'
                : '#38bdf8'
            : 'rgba(148, 163, 184, 0.18)',
        }}
      />
      <span className="font-mono text-[10px] font-bold text-(--text-secondary)">
        {count}
      </span>
    </div>
  );
}

export default function RekapWorkorderHourlyClose({ bucket }: { bucket?: string }) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.dashboard.rekapWorkorderHourly(bucket || 'all'),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (bucket && bucket !== 'all') params.set('bucket', bucket);
      const url = params.toString()
        ? `/api/dashboard/rekap-workorder/hourly-close?${params.toString()}`
        : '/api/dashboard/rekap-workorder/hourly-close';
      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed');
      return json.data as HourlyCloseRow[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const now = getWibNow();
  const currentHour = now.getHours();
  const dateLabel = format(now, 'EEEE, dd MMM yyyy', { timeZone: WIB_TIMEZONE });

  const chartData = useMemo(() => {
    if (!data) return ALL_HOURS;
    const map = new Map(data.map((item) => [item.hour, item.count]));
    return ALL_HOURS.map((item) => ({
      ...item,
      count: map.get(item.hour) ?? 0,
    }));
  }, [data]);

  const summary = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.count, 0);
    let peakHour: number | null = null;
    let peakCount = 0;
    for (const item of chartData) {
      if (item.count > peakCount) {
        peakCount = item.count;
        peakHour = item.hour;
      }
    }
    const activeHours = chartData.filter((item) => item.count > 0).length;
    const zeroHours = 24 - activeHours;
    const average = total / 24;
    const currentCount = chartData[currentHour]?.count ?? 0;
    const peakShare = total > 0 ? Math.round((peakCount / total) * 100) : 0;
    return {
      total,
      peakHour,
      peakCount,
      activeHours,
      zeroHours,
      average,
      currentCount,
      peakShare,
    };
  }, [chartData, currentHour]);

  const peakLabel = summary.peakHour !== null ? `${String(summary.peakHour).padStart(2, '0')}:00` : '-';
  const currentLabel = `${String(currentHour).padStart(2, '0')}:00`;

  return (
    <ChartContainer
      config={{ count: { label: 'Close', color: '#38bdf8' } }}
      className="p-0"
    >
      <div className="border-b border-(--border) px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-(--text-muted)">
                Close per jam WIB
              </p>
              <span className="rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-1 text-[11px] font-semibold text-(--text-secondary)">
                {dateLabel}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-(--text-primary)">
              Distribusi close workorder sepanjang hari
            </h3>
            <p className="mt-1 text-sm leading-6 text-(--text-secondary)">
              Pola jam yang paling aktif, jam berjalan, dan titik sepi dibuat mudah dibaca
              supaya user bisa cepat menangkap ritme penyelesaian tiket.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[460px]">
            <StatPill
              label="Total close"
              value={formatNumber(summary.total)}
              sub="hari ini"
              icon={<Activity className="h-4 w-4" />}
            />
            <StatPill
              label="Peak hour"
              value={peakLabel}
              sub={`${formatNumber(summary.peakCount)} tiket`}
              icon={<Flame className="h-4 w-4" />}
            />
            <StatPill
              label="Average"
              value={summary.average.toFixed(1)}
              sub="per jam"
              icon={<Clock3 className="h-4 w-4" />}
            />
            <StatPill
              label="Aktif"
              value={formatNumber(summary.activeHours)}
              sub={`${formatNumber(summary.zeroHours)} jam kosong`}
              icon={<SunMedium className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)] sm:p-5">
        <div className="space-y-4">
          {isLoading ? (
            <div className="h-[360px] animate-pulse rounded-2xl border border-(--border) bg-(--surface-2)" />
          ) : summary.total === 0 ? (
            <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-(--border) bg-(--surface-2) px-6 text-center">
              <div className="max-w-sm">
                <MoonStar className="mx-auto h-8 w-8 text-(--text-muted)" />
                <p className="mt-3 text-sm font-semibold text-(--text-primary)">
                  Belum ada close hari ini
                </p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  Chart akan terisi otomatis begitu ada tiket yang selesai di jam berjalan.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-(--border) bg-(--surface)">
              <div className="h-[320px] p-3 sm:p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
                    barCategoryGap={10}
                  >
                    <defs>
                      <linearGradient id="closeBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                      tickLine={false}
                      interval={2}
                      minTickGap={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label: unknown) => `Jam ${String(label)} WIB`}
                        />
                      }
                    />
                    <Bar dataKey="count" radius={[10, 10, 4, 4]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={`close-${entry.hour}`}
                          fill={getBarFill(entry.hour, entry.count, currentHour, summary.peakHour)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border-t border-(--border) px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-(--text-secondary)">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Peak hour
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Jam berjalan
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                    Close aktif
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-400/50" />
                    Jam kosong
                  </span>
                  {isFetching && (
                    <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                      Refreshing...
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isLoading && summary.total > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {chartData.map((item) => (
                <HourChip
                  key={item.hour}
                  hour={item.hour}
                  count={item.count}
                  currentHour={currentHour}
                  peakHour={summary.peakHour}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-(--border) bg-(--surface-2) p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
              Insight cepat
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-(--surface) p-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                  <Flame className="h-4 w-4 text-emerald-500" />
                  Jam paling padat
                </div>
                <p className="mt-2 text-2xl font-bold text-(--text-primary)">{peakLabel}</p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  {formatNumber(summary.peakCount)} close atau {summary.peakShare}% dari total close hari ini.
                </p>
              </div>

              <div className="rounded-xl bg-(--surface) p-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                  <Clock3 className="h-4 w-4 text-amber-500" />
                  Jam berjalan
                </div>
                <p className="mt-2 text-2xl font-bold text-(--text-primary)">{currentLabel}</p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  {formatNumber(summary.currentCount)} close tercatat di jam ini. {getHourBadge(currentHour)} ini sedang dipantau.
                </p>
              </div>

              <div className="rounded-xl bg-(--surface) p-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                  <Activity className="h-4 w-4 text-sky-500" />
                  Rata-rata distribusi
                </div>
                <p className="mt-2 text-2xl font-bold text-(--text-primary)">{summary.average.toFixed(1)}</p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  Close per jam dari total {formatNumber(summary.total)} ticket close yang terdistribusi di {formatNumber(summary.activeHours)} jam aktif.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--border) bg-gradient-to-br from-sky-500/10 via-transparent to-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
              Cara baca
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-(--text-secondary)">
              <li>• Batang tinggi menandakan jam close paling padat.</li>
              <li>• Warna hijau menandai peak hour, warna amber menandai jam berjalan.</li>
              <li>• Strip kecil di bawah chart memudahkan scan cepat tanpa membuka tooltip.</li>
            </ul>
          </div>
        </div>
      </div>
    </ChartContainer>
  );
}
