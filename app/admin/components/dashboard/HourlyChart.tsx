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

async function fetchHourlyTickets(workzone?: string) {
  const params = new URLSearchParams();
  if (workzone) params.set('workzone', workzone);
  const url = params.toString()
    ? `/api/dashboard/hourly-tickets?${params.toString()}`
    : '/api/dashboard/hourly-tickets';

  const res = await fetchWithAuth(url);
  if (!res) throw new Error('No response');
  const json = await res.json();
  if (!json?.success) throw new Error(json?.message || 'Failed');
  return json.data as Array<{ hour: number; count: number }>;
}

export default function HourlyChart({ workzone }: { workzone?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.operations({
      scopeVersion: `hourly-v2:${workzone || 'all'}`,
    }),
    queryFn: () => fetchHourlyTickets(workzone),
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
        <div className='bg-surface-2 h-[260px] w-full animate-pulse rounded-xl' />
      ) : (
        <div className='h-[260px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%'>
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
