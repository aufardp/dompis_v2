'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/app/components/ui/chart';
import type { TrendDatum } from '../../hooks/useTicketAnalytics';

export default function TicketTrendChart({
  data,
  loading,
  subtitle,
}: {
  data: TrendDatum[];
  loading?: boolean;
  subtitle?: string;
}) {
  return (
    <ChartContainer
      config={{ count: { label: 'Tickets', color: '#a78bfa' } }}
      className='min-h-[360px]'
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <div className='text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
            Ticket Trend
          </div>
          <div className='mt-1 text-xs text-(--text-muted)'>
            {subtitle ?? 'Ticket creation over time'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className='bg-surface-2 h-[280px] w-full animate-pulse rounded-xl' />
      ) : (
        <div className='h-[280px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart
              data={data}
              margin={{ left: 8, right: 12, top: 6, bottom: 6 }}
            >
              <CartesianGrid stroke='rgba(148,163,184,0.10)' vertical={false} />
              <XAxis
                dataKey='label'
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                tickLine={false}
                interval='preserveStartEnd'
                height={36}
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
                    labelFormatter={(l: unknown) => String(l)}
                  />
                }
              />
              <Line
                type='monotone'
                dataKey='count'
                stroke='var(--color-count)'
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}
