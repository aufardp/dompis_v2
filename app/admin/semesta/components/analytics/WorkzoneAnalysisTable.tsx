'use client';

import { useMemo, useState, useCallback } from 'react';
import { cn } from '@/app/libs/utils';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import type { WorkzoneAnalytics } from '../../hooks/useSemestaAnalyticsV2';

type SortKey = keyof WorkzoneAnalytics;
const SORTABLE_COLS: { key: SortKey; label: string }[] = [
  { key: 'workzone', label: 'Workzone' },
  { key: 'total', label: 'Total' },
  { key: 'gamas', label: 'Gamas' },
  { key: 'sqm', label: 'SQM' },
  { key: 'sqmCcan', label: 'SQM-CCAN' },
  { key: 'unspec', label: 'Unspec' },
  { key: 'unspecB2b', label: 'Unspec B2B' },
  { key: 'gaul', label: 'GAUL' },
  { key: 'lapul', label: 'LAPUL' },
];

function Badge({ value, color }: { value: number; color: string }) {
  if (value === 0) return <span className="text-(--text-muted)">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
        color,
      )}
    >
      {value.toLocaleString('en-US')}
    </span>
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

  const maxTotal = useMemo(
    () => Math.max(...(data?.map((d) => d.total) ?? [1]), 1),
    [data],
  );

  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = SORTABLE_COLS.map((c) => c.label).join(',');
    const rows = data.map((r) =>
      SORTABLE_COLS.map((c) => r[c.key]).join(','),
    );
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
              {SORTABLE_COLS.map((col) => (
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
                <td className='px-3 py-3'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold text-(--text-primary)'>
                      {row.total.toLocaleString('en-US')}
                    </span>
                    <div className='bg-surface-2 h-1.5 w-16 overflow-hidden rounded-full'>
                      <div
                        className='h-full rounded-full bg-blue-400 transition-all'
                        style={{
                          width: `${(row.total / maxTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className='px-3 py-3'>
                  <Badge value={row.gamas} color='bg-cyan-500/10 text-cyan-300' />
                </td>
                <td className='px-3 py-3'>
                  <Badge value={row.sqm} color='bg-violet-500/10 text-violet-300' />
                </td>
                <td className='px-3 py-3'>
                  <Badge
                    value={row.sqmCcan}
                    color='bg-purple-500/10 text-purple-300'
                  />
                </td>
                <td className='px-3 py-3'>
                  <Badge value={row.unspec} color='bg-slate-500/10 text-slate-300' />
                </td>
                <td className='px-3 py-3'>
                  <Badge value={row.unspecB2b} color='bg-red-500/10 text-red-300' />
                </td>
                <td className='px-3 py-3'>
                  <Badge
                    value={row.gaul}
                    color={
                      row.gaul > 0
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-(--text-muted)'
                    }
                  />
                </td>
                <td className='px-3 py-3'>
                  <Badge
                    value={row.lapul}
                    color={
                      row.lapul > 0
                        ? 'bg-orange-500/15 text-orange-300'
                        : 'text-(--text-muted)'
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.length > 15 && !showAll && (
        <div className="border-t border-(--border) px-4 py-3 text-center">
          <button
            onClick={() => setShowAll(true)}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            Tampilkan semua ({data.length} workzone)
          </button>
        </div>
      )}
    </div>
  );
}
