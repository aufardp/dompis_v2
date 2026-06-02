'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendByDept } from '../../hooks/useSemestaAnalyticsV2';

function formatDateLabel(date: string) {
  if (date.length === 7) {
    const [y, m] = date.split('-');
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  }
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function B2cB2bTrendChart({
  data,
  loading,
}: {
  data?: TrendByDept[];
  loading?: boolean;
}) {
  return (
    <div className="bg-surface overflow-hidden rounded-xl border border-(--border)">
      <div className="px-4 pt-4 pb-2">
        <div className="font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase">
          B2C vs B2B Trend
        </div>
        <div className="font-dm-sans mt-1 text-xs text-(--text-muted)">
          Volume comparison by customer segment
        </div>
      </div>

      {loading ? (
        <div className="bg-surface-2 mx-4 mb-4 h-[240px] animate-pulse rounded-xl" />
      ) : (
        <div className="h-[280px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 6, bottom: 6 }}>
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
                tickFormatter={(n: unknown) => typeof n === 'number' ? n.toLocaleString('en-US') : String(n)}
              />
              <Tooltip
                labelFormatter={(l: unknown) => `Date: ${String(l)}`}
                formatter={(value: unknown, name: unknown) => [
                  typeof value === 'number' ? value.toLocaleString('id-ID') : String(value ?? 0),
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
              <Area
                type="monotone"
                dataKey="b2c"
                name="B2C"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="b2b"
                name="B2B"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
