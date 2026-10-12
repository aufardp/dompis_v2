'use client';

import { useMemo, useState, useCallback } from 'react';
import { cn } from '@/app/libs/utils';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import type { WorkzoneAnalytics } from '../../hooks/useSemestaAnalyticsV2';

type SortKey = keyof WorkzoneAnalytics;

type Col = {
  key: SortKey;
  label: string;
  bar?: string;
};

const COLUMNS: Col[] = [
  { key: 'workzone', label: 'Workzone' },
  { key: 'total', label: 'Total', bar: 'bg-blue-400' },
  { key: 'gamas', label: 'Gamas', bar: 'bg-cyan-400' },
  { key: 'sqm', label: 'SQM', bar: 'bg-violet-400' },
  { key: 'sqmCcan', label: 'SQM-CCAN', bar: 'bg-purple-400' },
  { key: 'unspec', label: 'Unspec', bar: 'bg-slate-400' },
  { key: 'unspecB2b', label: 'Unspec B2B', bar: 'bg-red-400' },
  { key: 'gaul', label: 'GAUL', bar: 'bg-amber-400' },
];

const SORTABLE_COLS = COLUMNS;

const TOTAL_KEYS: SortKey[] = [
  'total',
  'gamas',
  'sqm',
  'sqmCcan',
  'unspec',
  'unspecB2b',
  'gaul',
];

function CellBar({
  value,
  max,
  bar,
}: {
  value: number;
  max: number;
  bar?: string;
}) {
  if (value === 0) {
    return <span className="text-(--text-muted)">—</span>;
  }
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2" title={`${value} (${pct.toFixed(1)}%)`}>
      <span className="w-12 shrink-0 text-right font-semibold text-(--text-primary) tabular-nums">
        {value.toLocaleString('en-US')}
      </span>
      <div className="h-1.5 w-full min-w-[40px] overflow-hidden rounded-full bg-(--surface-2)">
        <div
          className={cn('h-full rounded-full transition-all', bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WorkzoneAnalysisLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading workzone analysis'
    >
      <div className='overflow-hidden rounded-xl border border-(--border) bg-(--surface)'>
        <div className='flex items-center justify-between px-4 pt-4 pb-3'>
          <div className='space-y-2'>
            <div className='h-3.5 w-44 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-3 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          </div>
          <div className='h-8 w-20 rounded-lg bg-slate-100 dark:bg-slate-800/70' />
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full text-left text-[12px]'>
            <thead>
              <tr className='border-b border-(--border)'>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i} className='px-3 py-3'>
                    <div className='h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800' />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }, (_, row) => (
                <tr key={row} className='border-b border-(--border)/50'>
                  {Array.from({ length: 9 }, (_, col) => (
                    <td key={col} className='px-3 py-4'>
                      <div
                        className='h-5 rounded-full bg-slate-100 dark:bg-slate-800/70'
                        style={{
                          width: `${70 - ((row + col) % 4) * 10}%`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function WorkzoneAnalysisTable({
  data,
  loading,
}: {
  data?: WorkzoneAnalytics[];
  loading?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showAll, setShowAll] = useState(false);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    const list = showAll ? data : data.slice(0, 15);
    return [...list].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, showAll]);

  const maxByKey = useMemo(() => {
    const out = {} as Record<SortKey, number>;
    for (const key of TOTAL_KEYS) {
      out[key] = Math.max(...(data?.map((d) => d[key] as number) ?? [0]), 1);
    }
    return out;
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return null;
    const out = {} as Record<SortKey, number>;
    for (const key of TOTAL_KEYS) {
      out[key] = data.reduce((sum, row) => sum + ((row[key] as number) ?? 0), 0);
    }
    return out;
  }, [data]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = SORTABLE_COLS.map((c) => c.label).join(',');
    const rows = data.map((r) => SORTABLE_COLS.map((c) => r[c.key]).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workzone-analysis.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ArrowUpDown size={12} className="opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  if (loading) {
    return <WorkzoneAnalysisLoading />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-(--border) px-4 py-8 text-center text-[12px] text-(--text-muted)">
        Tidak ada data workzone pada rentang ini
      </div>
    );
  }

  return (
    <div className="bg-surface overflow-hidden rounded-xl border border-(--border)">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase">
            Workzone Analysis
          </div>
          <div className="font-dm-sans mt-1 text-xs text-(--text-muted)">
            Ticket distribution and special flags per workzone
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-(--border) px-3 py-1.5 text-[11px] font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400"
        >
          <Download size={13} />
          CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-(--border)">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    'cursor-pointer select-none px-3 py-3 font-outfit text-[10px] font-bold tracking-[1px] text-(--text-secondary) uppercase transition hover:text-(--text-primary)',
                    sortKey === col.key && 'text-(--text-primary)',
                  )}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.workzone}
                className='border-b border-(--border)/50 transition hover:bg-white/[0.02]'
              >
                <td className='px-3 py-3 font-semibold text-(--text-primary)'>
                  {row.workzone}
                </td>
                {TOTAL_KEYS.map((key) => {
                  const col = COLUMNS.find((c) => c.key === key)!;
                  return (
                    <td key={key} className='px-3 py-3'>
                      <CellBar
                        value={row[key] as number}
                        max={maxByKey[key]}
                        bar={col.bar}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {totals && (
              <tr className="border-t-2 border-(--border) bg-(--surface-2)">
                <td className='px-3 py-3 font-semibold text-(--text-primary)'>
                  Total
                </td>
                {TOTAL_KEYS.map((key) => {
                  const col = COLUMNS.find((c) => c.key === key)!;
                  return (
                    <td key={key} className='px-3 py-3'>
                      <CellBar
                        value={totals[key]}
                        max={maxByKey[key]}
                        bar={col.bar}
                      />
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.length > 15 && !showAll && (
        <div className="border-t border-(--border) px-4 py-3 text-center">
          <button
            onClick={() => setShowAll(true)}
            className="text-[11px] font-semibold text-blue-400 transition hover:text-blue-300"
          >
            Tampilkan semua ({data.length} workzone)
          </button>
        </div>
      )}
    </div>
  );
}