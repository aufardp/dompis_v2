'use client';

import * as React from 'react';
import { cn } from '@/app/libs/utils';

export type ChartConfig = Record<
  string,
  {
    label: string;
    color?: string;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx)
    throw new Error('Chart components must be used within ChartContainer');
  return ctx;
}

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const style = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, v] of Object.entries(config)) {
      if (v.color) vars[`--color-${key}`] = v.color;
    }
    return vars as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          'bg-surface relative overflow-hidden rounded-xl border border-(--border) p-4',
          'transition-all duration-300 ease-in-out',
          className,
        )}
        style={style}
      >
        {children}
      </div>
    </ChartContext.Provider>
  );
}

function formatValue(value: unknown) {
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return String(value ?? '');
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
}: any) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  const renderedLabel =
    typeof labelFormatter === 'function' ? labelFormatter(label) : label;

  return (
    <div className='bg-surface-2 w-[240px] rounded-xl border border-(--border) p-3 shadow-xl'>
      <div className='mb-2 text-xs font-semibold tracking-wide text-(--text-secondary)'>
        {renderedLabel}
      </div>
      <div className='space-y-1.5'>
        {payload.map((item: any) => {
          const key = String(item.dataKey ?? item.name ?? 'value');
          const cfg = config[key];
          const dotColor =
            cfg?.color ?? (item.color as string | undefined) ?? '#94a3b8';

          return (
            <div key={key} className='flex items-center justify-between gap-3'>
              <div className='flex min-w-0 items-center gap-2'>
                <span
                  className='h-2.5 w-2.5 shrink-0 rounded-full'
                  style={{ background: dotColor }}
                />
                <span className='truncate text-xs text-(--text-secondary)'>
                  {cfg?.label ?? item.name ?? key}
                </span>
              </div>
              <span className='text-xs font-bold text-(--text-primary)'>
                {formatValue(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({ payload }: any) {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div className='mt-3 flex flex-wrap items-center gap-3'>
      {payload.map((item: any) => {
        const key = String(item.dataKey ?? item.value ?? item.id ?? 'value');
        const cfg = config[key];
        const dotColor = cfg?.color ?? (item.color as string | undefined);
        return (
          <div key={key} className='flex items-center gap-2 text-xs'>
            <span
              className='h-2.5 w-2.5 rounded-full'
              style={{ background: dotColor ?? '#94a3b8' }}
            />
            <span className='text-(--text-secondary)'>
              {cfg?.label ?? item.value ?? key}
            </span>
          </div>
        );
      })}
    </div>
  );
}
