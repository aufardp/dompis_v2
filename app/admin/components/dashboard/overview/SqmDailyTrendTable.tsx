'use client';

import { useMemo } from 'react';
import { useSqmDailyTrend } from '@/app/hooks/useTtrComplianceOverview';

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function dateLabel(iso: string): { dayLabel: string; dayNum: string } {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return { dayLabel: DAY_LABELS[dow], dayNum: String(d.getDate()) };
}

const ROWS: {
  key: 'open' | 'workHour' | 'nonWorkHour';
  label: string;
  variant: 'total' | 'sub';
}[] = [
  { key: 'open', label: 'Open Ticket', variant: 'total' },
  { key: 'workHour', label: 'WorkHour', variant: 'sub' },
  { key: 'nonWorkHour', label: 'Non-WorkHour', variant: 'sub' },
];

export default function SqmDailyTrendTable({
  workzone,
  branch,
}: {
  workzone?: string;
  branch?: string;
}) {
  const { data, isLoading } = useSqmDailyTrend({ workzone, branch });
  const days = data?.days ?? [];

  const weeks = useMemo(() => {
    const chunks: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      chunks.push(days.slice(i, i + 7));
    }
    return chunks;
  }, [days]);

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='mb-3'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
          Daily Trend
        </p>
        <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
          Tiket open bucket Customer + Proactive (4 minggu terakhir)
        </p>
      </div>

      {isLoading ? (
        <div className='h-32 animate-pulse rounded-2xl bg-(--surface-2)' />
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-max min-w-full border-collapse text-xs'>
            <thead>
              <tr>
                <th className='sticky left-0 z-10 min-w-28 bg-(--surface) px-2 py-1.5 text-left text-[9px] font-bold tracking-[0.16em] text-(--text-muted) uppercase' />
                {weeks.map((week, wi) => (
                  <th
                    key={wi}
                    colSpan={week.length}
                    className='border-l border-(--border) bg-(--surface-2)/60 px-2 py-1 text-center text-[9px] font-bold tracking-[0.16em] text-(--text-secondary) uppercase'
                  >
                    Week {wi + 1}
                  </th>
                ))}
              </tr>
              <tr className='border-b border-(--border)'>
                <th className='sticky left-0 z-10 bg-(--surface) px-2 py-1 text-left text-[9px] font-semibold text-(--text-muted) uppercase' />
                {days.map((d) => {
                  const { dayLabel, dayNum } = dateLabel(d.date);
                  return (
                    <th
                      key={d.date}
                      className='min-w-9 px-1 py-1 text-center text-[9px] font-semibold text-(--text-muted)'
                      title={d.date}
                    >
                      <div>{dayLabel}</div>
                      <div className='text-[10px] text-(--text-secondary)'>
                        {dayNum}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const isTotal = row.variant === 'total';
                return (
                  <tr
                    key={row.key}
                    className={
                      isTotal
                        ? 'border-b-2 border-(--border) bg-(--surface-2)/40'
                        : 'border-b border-(--border)/60'
                    }
                  >
                    <td
                      className={
                        isTotal
                          ? 'sticky left-0 z-10 bg-(--surface-2) px-2 py-1.5 text-[10px] font-bold whitespace-nowrap text-(--text-primary) uppercase'
                          : 'sticky left-0 z-10 bg-(--surface) py-1 pr-2 pl-3 text-[9px] font-medium whitespace-nowrap text-(--text-muted)'
                      }
                    >
                      {row.label}
                    </td>
                    {days.map((d) => (
                      <td
                        key={d.date}
                        className={
                          isTotal
                            ? 'px-1 py-1.5 text-center font-mono text-[11px] font-bold text-(--text-primary) tabular-nums'
                            : 'px-1 py-1 text-center font-mono text-[10px] text-(--text-secondary) tabular-nums'
                        }
                      >
                        {d[row.key] > 0 ? (
                          d[row.key]
                        ) : (
                          <span className='text-(--text-muted)'>0</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className='mt-2 text-[10px] text-(--text-muted)'>
            <span className='font-semibold text-(--text-secondary)'>
              Open Ticket
            </span>{' '}
            = WorkHour + Non-WorkHour
          </p>
        </div>
      )}
    </div>
  );
}
