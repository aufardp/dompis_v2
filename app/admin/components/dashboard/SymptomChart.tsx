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

export default function SymptomChart({ workzone }: { workzone?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'top-symptoms', workzone || 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzone) params.set('workzone', workzone);
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
        <div className='bg-surface-2 h-[300px] w-full animate-pulse rounded-xl' />
      ) : isEmpty ? (
        <div className='flex h-[300px] items-center justify-center'>
          <p className='text-xs text-(--text-muted)'>No symptom data available</p>
        </div>
      ) : (
        <div className='h-[300px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%'>
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
