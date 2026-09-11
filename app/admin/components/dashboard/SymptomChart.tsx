'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/app/components/ui/chart';
import { fetchWithAuth } from '@/app/libs/fetcher';

const MAX_LABEL_LENGTH = 30;

function truncateLabel(val: string) {
  if (val.length <= MAX_LABEL_LENGTH) return val;
  return val.slice(0, MAX_LABEL_LENGTH) + '...';
}

function SymptomChartLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading symptom chart'
    >
      <div className='min-h-[380px]'>
        <div className='mb-3 flex items-start justify-between gap-3'>
          <div className='space-y-2'>
            <div className='h-3.5 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-3 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          </div>
        </div>
        <div className='grid h-[300px] grid-cols-[160px_1fr] gap-3 rounded-xl border border-slate-200 bg-slate-100/80 p-4 dark:border-slate-800 dark:bg-slate-900/70'>
          <div className='flex flex-col justify-between gap-3'>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className='h-3.5 rounded-full bg-slate-200 dark:bg-slate-800'
                style={{ width: `${70 + (index % 3) * 10}%` }}
              />
            ))}
          </div>
          <div className='flex flex-col justify-between gap-3'>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className='flex items-center gap-3'>
                <div className='h-3 flex-1 rounded-full bg-slate-200 dark:bg-slate-800' />
                <div className='h-3 w-10 rounded-full bg-slate-100 dark:bg-slate-700/70' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function SymptomChart({
  workzone,
  branch,
  bucket,
}: {
  workzone?: string;
  branch?: string;
  bucket?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'top-symptoms', workzone || 'all', branch || 'all', bucket || 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzone) params.set('workzone', workzone);
      if (branch) params.set('branch', branch);
      if (bucket && bucket !== 'all') params.set('bucket', bucket);
      const url = params.toString()
        ? `/api/dashboard/top-symptoms?${params.toString()}`
        : '/api/dashboard/top-symptoms';
      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed');
      return json.data as Array<{ symptom: string; count: number }>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    return (data ?? []).map((d) => ({
      symptom: d.symptom,
      displayLabel: truncateLabel(d.symptom),
      count: d.count,
    }));
  }, [data]);

  const isEmpty = !data || data.length === 0;

  return (
    <ChartContainer
      config={{ count: { label: 'Tickets', color: '#7c3aed' } }}
      className='min-h-[380px]'
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <div className='font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
            Top 10 Symptoms
          </div>
          <div className='font-dm-sans mt-1 text-xs text-(--text-muted)'>
            Most common symptoms reported today
          </div>
        </div>
      </div>

      {isLoading ? (
        <SymptomChartLoading />
      ) : isEmpty ? (
        <div className='flex h-[300px] items-center justify-center'>
          <p className='text-xs text-(--text-muted)'>No symptom data available</p>
        </div>
      ) : (
        <div className='h-[300px] w-full min-w-0 animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%' minWidth={0} minHeight={200}>
            <BarChart
              data={chartData}
              layout='vertical'
              margin={{ left: 12, right: 40, top: 6, bottom: 6 }}
            >
              <CartesianGrid stroke='rgba(148,163,184,0.10)' horizontal={false} />
              <XAxis
                type='number'
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type='category'
                dataKey='displayLabel'
                tick={{ fill: 'rgb(136 150 179)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                tickLine={false}
                width={160}
              />
              <Tooltip
                content={(props: any) => {
                  const fullSymptom = props.payload?.[0]?.payload?.symptom;
                  return (
                    <ChartTooltipContent
                      {...props}
                      labelFormatter={() => fullSymptom ? `Symptom: ${fullSymptom}` : 'Symptom: -'}
                    />
                  );
                }}
              />
              <Bar
                dataKey='count'
                fill='var(--color-count)'
                radius={[0, 10, 10, 0]}
              >
                <LabelList
                  dataKey='count'
                  position='right'
                  formatter={(val: unknown) => typeof val === 'number' ? val.toLocaleString() : String(val ?? '')}
                  style={{ fill: 'rgb(136 150 179)', fontSize: 11, fontWeight: 700 }}
                  offset={4}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}
