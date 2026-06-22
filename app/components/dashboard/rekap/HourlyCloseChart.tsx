'use client';

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
import { ChartTooltipContent } from '@/app/components/ui/chart';

type ChartDataItem = {
  hour: number;
  label: string;
  shortLabel: string;
  count: number;
};

function getBarFill(
  hour: number,
  count: number,
  currentHour: number,
  peakHour: number | null,
): string {
  if (count === 0) return 'rgba(148, 163, 184, 0.20)';
  if (peakHour === hour) return '#10b981';
  if (currentHour === hour) return '#f59e0b';
  if (count >= 8) return '#38bdf8';
  if (count >= 4) return '#60a5fa';
  return '#7c3aed';
}

export default function HourlyCloseChart({
  data,
  currentHour,
  peakHour,
  isFetching,
}: {
  data: ChartDataItem[];
  currentHour: number;
  peakHour: number | null;
  isFetching: boolean;
}) {
  return (
    <div className='rounded-2xl border border-(--border) bg-(--surface)'>
      <div className='h-62.5 p-3 sm:h-80 sm:p-4'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart
            data={data}
            margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
            barCategoryGap={10}
          >
            <defs>
              <linearGradient
                id='closeBarGradient'
                x1='0'
                y1='0'
                x2='0'
                y2='1'
              >
                <stop
                  offset='0%'
                  stopColor='#38bdf8'
                  stopOpacity={0.95}
                />
                <stop
                  offset='100%'
                  stopColor='#3b82f6'
                  stopOpacity={0.75}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke='rgba(148,163,184,0.12)'
              vertical={false}
            />
            <XAxis
              dataKey='shortLabel'
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
                  labelFormatter={(label: unknown) =>
                    `Jam ${String(label)} WIB`
                  }
                />
              }
            />
            <Bar dataKey='count' radius={[10, 10, 4, 4]}>
              {data.map((entry) => (
                <Cell
                  key={`close-${entry.hour}`}
                  fill={getBarFill(
                    entry.hour,
                    entry.count,
                    currentHour,
                    peakHour,
                  )}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className='border-t border-(--border) px-4 py-3'>
        <div className='flex flex-wrap items-center gap-3 text-xs text-(--text-secondary)'>
          <span className='inline-flex items-center gap-1.5'>
            <span className='h-2.5 w-2.5 rounded-full bg-emerald-500' />
            Peak hour
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <span className='h-2.5 w-2.5 rounded-full bg-amber-500' />
            Jam berjalan
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <span className='h-2.5 w-2.5 rounded-full bg-sky-500' />
            Close aktif
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <span className='h-2.5 w-2.5 rounded-full bg-slate-400/50' />
            Jam kosong
          </span>
          {isFetching && (
            <span className='ml-auto text-[11px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
              Refreshing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
