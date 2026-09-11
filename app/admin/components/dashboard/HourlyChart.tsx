'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/app/components/ui/chart';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  label: `${String(i).padStart(2, '0')}:00`,
  count: 0,
}));

function HourlyChartLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading hourly chart'
    >
      <div className='min-h-[340px]'>
        <div className='mb-3 flex items-start justify-between gap-3'>
          <div className='space-y-2'>
            <div className='h-3.5 w-44 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-3 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          </div>
        </div>
        <div className='h-[260px] rounded-xl border border-slate-200 bg-slate-100/80 p-4 dark:border-slate-800 dark:bg-slate-900/70'>
          <div className='flex h-full items-end gap-2'>
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className='flex-1 rounded-t-lg bg-gradient-to-t from-slate-200 via-slate-100 to-slate-100 dark:from-slate-700 dark:via-slate-800 dark:to-slate-800'
                style={{ height: `${30 + (index % 6) * 11}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function HourlyChart({
  workzone,
  branch,
  bucket,
}: {
  workzone?: string;
  branch?: string;
  bucket?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.operations({
      scopeVersion: `hourly:${workzone || 'all'}:${branch || 'all'}:${bucket || 'all'}`,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzone) params.set('workzone', workzone);
      if (branch) params.set('branch', branch);
      if (bucket && bucket !== 'all') params.set('bucket', bucket);
      const url = params.toString()
        ? `/api/dashboard/hourly-tickets?${params.toString()}`
        : '/api/dashboard/hourly-tickets';

      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed');
      return json.data as Array<{ hour: number; count: number }>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    if (!data) return ALL_HOURS;
    const map = new Map(data.map((d) => [d.hour, d.count]));
    return ALL_HOURS.map((h) => ({
      ...h,
      count: map.get(h.hour) ?? 0,
    }));
  }, [data]);

  return (
    <ChartContainer
      config={{ count: { label: 'Tickets', color: '#3b82f6' } }}
      className='min-h-[340px]'
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <div className='font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
            Hourly Ticket Distribution
          </div>
          <div className='font-dm-sans mt-1 text-xs text-(--text-muted)'>
            Tickets reported per hour today
          </div>
        </div>
      </div>

      {isLoading ? (
        <HourlyChartLoading />
      ) : (
        <div className='h-[260px] w-full min-w-0 animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%' minWidth={0} minHeight={200}>
            <BarChart
              data={chartData}
              margin={{ left: 24, right: 24, top: 6, bottom: 6 }}
            >
              <CartesianGrid stroke='rgba(148,163,184,0.10)' vertical={false} />
              <XAxis
                dataKey='label'
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                tickLine={false}
                interval={0}
                height={40}
                angle={-45}
                textAnchor='end'
              />
              <YAxis
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={34}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(l: unknown) => `Hour: ${String(l)}`}
                  />
                }
              />
              <Bar
                dataKey='count'
                fill='var(--color-count)'
                radius={[10, 10, 6, 6]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}
