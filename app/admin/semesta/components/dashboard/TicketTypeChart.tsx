'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/app/components/ui/chart';
import type { TicketTypeDatum } from '../../hooks/useTicketAnalytics';

export default function TicketTypeChart({
  data,
  loading,
}: {
  data: TicketTypeDatum[];
  loading?: boolean;
}) {
  return (
    <ChartContainer
      config={{ count: { label: 'Tickets', color: '#60a5fa' } }}
      className='min-h-[340px]'
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <div className='text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
            Ticket by Type
          </div>
          <div className='mt-1 text-xs text-(--text-muted)'>
            B2C by customer type, B2B by jenis tiket
          </div>
        </div>
      </div>

      {loading ? (
        <div className='bg-surface-2 h-[260px] w-full animate-pulse rounded-xl' />
      ) : (
        <div className='h-[260px] animate-[fadeIn_300ms_ease-in-out_forwards] opacity-0'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              data={data}
              margin={{ left: 8, right: 8, top: 6, bottom: 6 }}
            >
              <CartesianGrid stroke='rgba(148,163,184,0.10)' vertical={false} />
              <XAxis
                dataKey='label'
                tick={{ fill: 'rgb(136 150 179)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.14)' }}
                tickLine={false}
                interval={0}
                height={40}
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
                    labelFormatter={(l: unknown) => `Type: ${String(l)}`}
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
