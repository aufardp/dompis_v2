'use client';

import { Fragment, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import DurationCell from './DurationCell';

interface SASummary {
  name: string;
  counts: number[];
}

interface PanelArea {
  name: string;
  region: string;
  sas: SASummary[];
}

interface DurationTableProps {
  areas: PanelArea[];
  totals: number[];
  buckets: string[];
  showTotal?: boolean;
}

const BUCKET_HEADER_COLORS = [
  'bg-emerald-600', 'bg-lime-500', 'bg-yellow-500',
  'bg-orange-500', 'bg-red-600', 'bg-red-900',
];

export default function DurationTable({ areas, totals, buckets, showTotal }: DurationTableProps) {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(areas.map((a) => a.name)));

  const toggleArea = useCallback((name: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (areas.length === 0) {
    return <div className="py-8 text-center text-sm text-(--text-muted)">Tidak ada tiket open</div>;
  }

  const bucketCount = buckets.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-(--surface-2) text-(--text-primary)">
            <th className="sticky left-0 z-10 bg-(--surface-2) px-3 py-2 text-left font-semibold min-w-[80px]">SA</th>
            {buckets.map((bucket, idx) => (
              <th key={`bucket-${idx}`} className={`px-2 py-2 text-center font-semibold text-white ${BUCKET_HEADER_COLORS[idx] ?? 'bg-gray-700'} min-w-[48px]`}>
                {bucket}
              </th>
            ))}
            {showTotal && <th className="px-2 py-2 text-center font-semibold bg-red-800 min-w-[48px]">TOTAL</th>}
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const isExpanded = expandedAreas.has(area.name);
            return (
              <Fragment key={area.name}>
                <tr>
                  <td
                    colSpan={bucketCount + (showTotal ? 2 : 1)}
                    className="bg-(--surface-2) px-4 py-1 border-l-4 border-blue-500 cursor-pointer select-none"
                    onClick={() => toggleArea(area.name)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-(--text-muted)">{area.name}</span>
                      <ChevronDown
                        size={14}
                        className={clsx(
                          'text-(--text-muted) transition-transform duration-200',
                          isExpanded && 'rotate-180',
                        )}
                      />
                    </div>
                  </td>
                </tr>
                {isExpanded && area.sas.map((sa) => {
                  const saTotal = sa.counts.reduce((s, v) => s + v, 0);
                  return (
                    <tr key={`${area.name}-${sa.name}`} className="hover:bg-(--surface-2)">
                      <td className="sticky left-0 z-10 bg-(--surface) px-3 py-1.5 font-medium text-(--text-primary) border-b border-(--border) min-w-[80px] truncate" title={sa.name}>
                        {sa.name}
                      </td>
                      {sa.counts.map((count, idx) => (
                        <DurationCell key={`${area.name}-${sa.name}-${idx}`} value={count} bucketIndex={idx} totalBuckets={bucketCount} />
                      ))}
                      {showTotal && (
                        <td className={`px-2 py-0.5 text-center font-mono text-xs font-bold border-b border-(--border) ${saTotal > 0 ? 'bg-red-800 text-white' : ''}`}>
                          {saTotal > 0 ? saTotal : ''}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className="sticky bottom-0 z-10 bg-(--surface-2) text-(--text-primary) font-mono font-bold border-t-2 border-(--border)">
            <td className="sticky left-0 z-10 bg-(--surface-2) px-3 py-1.5 text-right">TOTAL</td>
            {totals.map((total, idx) => (
              <td key={`total-${idx}`} className={`px-2 py-1.5 text-center ${BUCKET_HEADER_COLORS[idx] ?? 'bg-gray-700'} text-white`}>
                {total > 0 ? total : ''}
              </td>
            ))}
            {showTotal && (
              <td className="px-2 py-1.5 text-center bg-red-800 text-white">
                {totals.reduce((s, v) => s + v, 0) > 0 ? totals.reduce((s, v) => s + v, 0) : ''}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
