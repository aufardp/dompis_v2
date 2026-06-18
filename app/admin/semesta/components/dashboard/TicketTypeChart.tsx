'use client';

import '@aejkatappaja/phantom-ui';
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
          <div className='font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
            Ticket by Type
          </div>
          <div className='font-dm-sans mt-1 text-xs text-(--text-muted)'>
            B2C by customer type, B2B by jenis tiket
          </div>
        </div>
      </div>

      {loading ? (
        <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading ticket type chart'>
          <div className='h-[260px] rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900'>
            <div className='flex h-full items-end gap-4'>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className='flex-1 space-y-2'>
                  <div
                    className='mx-auto rounded-t-xl bg-slate-200 dark:bg-white/10'
                    style={{ height: `${30 + index * 10}%` }}
                  />
                  <div className='h-3 rounded-full bg-slate-200 dark:bg-white/10' />
                </div>
              ))}
            </div>
          </div>
        </phantom-ui>
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
