'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendByJenis } from '../../hooks/useSemestaAnalyticsV2';

const PALETTE = [
  '#60a5fa', '#8b5cf6', '#a855f7', '#ef4444', '#34d399',
  '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
  '#14b8a6', '#6366f1', '#d946ef', '#22c55e', '#eab308',
  '#0ea5e9', '#a1a1aa',
];

function formatDateLabel(date: string) {
  if (date.length === 7) {
    const [y, m] = date.split('-');
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  }
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function formatNumber(n: number) {
  return n.toLocaleString('en-US');
}

export default function TrendByJenisChart({
  data,
  loading,
}: {
  data?: TrendByJenis[];
  loading?: boolean;
}) {
  const stackKeys = useMemo(() => {
    if (!data?.length) return [];
    const exclude = new Set(['date']);
    return Object.keys(data[0]).filter(k => !exclude.has(k));
  }, [data]);

  return (
    <div className="bg-surface overflow-hidden rounded-xl border border-(--border)">
      <div className="px-4 pt-4 pb-2">
        <div className="font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase">
          Trend by Jenis Tiket
        </div>
        <div className="font-dm-sans mt-1 text-xs text-(--text-muted)">
          Daily ticket composition by ticket type
        </div>
      </div>

      {loading ? (
        <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading trend chart'>
          <div className="mx-4 mb-4 h-[240px] rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <div className="flex h-full items-end gap-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex-1 space-y-2">
                  <div
                    className="mx-auto rounded-t-lg bg-slate-200 dark:bg-white/10"
                    style={{ height: `${25 + (index % 4) * 14}%` }}
                  />
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </phantom-ui>
      ) : (
        <div className="h-[280px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 6, bottom: 6 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                tickLine={false}
                interval="preserveStartEnd"
                height={36}
              />
              <YAxis
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(n: unknown) => typeof n === 'number' ? formatNumber(n) : String(n)}
              />
              <Tooltip
                labelFormatter={(l: unknown) => `Date: ${String(l)}`}
                formatter={(value: unknown, name: unknown) => [
                  typeof value === 'number' ? formatNumber(value) : String(value ?? 0),
                  String(name),
                ]}
                contentStyle={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
              />
              {stackKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={PALETTE[i % PALETTE.length]}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
