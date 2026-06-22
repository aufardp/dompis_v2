'use client';

import { Fragment, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import DurationCell from './DurationCell';
import type { DurasiDetailTarget, DurasiPanelType } from './durasi-types';

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
  bucketKey: DurasiDetailTarget['bucket'];
  bucketLabel: string;
  panelType: DurasiPanelType;
  panelLabel: string;
  onCellClick?: (target: DurasiDetailTarget) => void;
}

const BUCKET_HEADER_COLORS = [
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  'bg-lime-100 text-lime-800 dark:bg-lime-950/30 dark:text-lime-200',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200',
  'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-200',
  'bg-red-200 text-red-800 dark:bg-red-950/50 dark:text-red-200',
];

export default function DurationTable({
  areas,
  totals,
  buckets,
  showTotal,
  bucketKey,
  bucketLabel,
  panelType,
  panelLabel,
  onCellClick,
}: DurationTableProps) {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set());

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

  const handleCellClick = useCallback(
    (areaName: string, saName: string | null, bucketIndex: number, value: number) => {
      if (!onCellClick || value <= 0) return;
      onCellClick({
        bucket: bucketKey,
        bucketLabel,
        panelType,
        panelLabel,
        area: areaName,
        sa: saName,
        bucketIndex,
        bucketName: buckets[bucketIndex] ?? '-',
      });
    },
    [bucketKey, bucketLabel, buckets, onCellClick, panelLabel, panelType],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] sm:text-[11px]">
        <thead>
          <tr className="bg-(--surface-2) text-(--text-primary)">
            <th className="sticky left-0 z-10 min-w-[68px] bg-(--surface-2) px-2 py-1.25 text-left font-semibold uppercase tracking-[0.16em] text-(--text-muted) sm:min-w-[80px] sm:px-3 sm:py-2">
              SA
            </th>
            {buckets.map((bucket, idx) => (
              <th
                key={`bucket-${idx}`}
                className={`min-w-[38px] px-1.25 py-1.25 text-center font-semibold sm:min-w-[48px] sm:px-2 sm:py-2 ${BUCKET_HEADER_COLORS[idx] ?? 'bg-(--surface-3) text-(--text-muted)'}`}
              >
                {bucket}
              </th>
            ))}
            {showTotal && (
              <th className="min-w-[38px] bg-(--surface-3) px-1.25 py-1.25 text-center font-semibold text-(--text-muted) sm:min-w-[48px] sm:px-2 sm:py-2">
                TOTAL
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const isExpanded = expandedAreas.has(area.name);
            return (
              <Fragment key={area.name}>
                {(() => {
                  const areaCounts = area.sas.reduce(
                    (acc, sa) => sa.counts.map((c, i) => acc[i] + c),
                    new Array<number>(bucketCount).fill(0),
                  );
                  const areaTotal = areaCounts.reduce((s, v) => s + v, 0);
                  return (
                  <tr
                      className="cursor-pointer select-none border-l-4 border-blue-500 bg-(--surface-2)/80"
                      onClick={() => toggleArea(area.name)}
                    >
                      <td className="sticky left-0 z-10 bg-(--surface-2)/95 px-2 py-1 backdrop-blur sm:px-3 sm:py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-(--text-secondary) sm:text-[10px] sm:tracking-[0.16em]">
                            {area.name}
                          </span>
                          <ChevronDown
                            size={14}
                            className={clsx(
                              'text-(--text-muted) transition-transform duration-200',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </div>
                      </td>
                      {areaCounts.map((count, idx) => (
                        <DurationCell
                          key={`area-${area.name}-${idx}`}
                          value={count}
                          bucketIndex={idx}
                          onClick={() => handleCellClick(area.name, null, idx, count)}
                          ariaLabel={`Lihat detail ${count} tiket untuk ${area.name}, bucket ${buckets[idx] ?? '-'}`}
                        />
                      ))}
                      {showTotal && (
                        <td className={`px-1 py-0.5 text-center font-mono text-[10px] font-bold ${areaTotal > 0 ? 'bg-red-800 text-white' : 'text-(--text-muted)'}`}>
                          {areaTotal > 0 ? areaTotal : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })()}
                {isExpanded && area.sas.map((sa) => {
                  const saTotal = sa.counts.reduce((s, v) => s + v, 0);
                  return (
                    <tr key={`${area.name}-${sa.name}`} className="hover:bg-(--surface-2)">
                      <td className="sticky left-0 z-10 min-w-[68px] truncate border-b border-(--border) bg-(--surface) px-2 py-1 font-medium text-(--text-primary) sm:min-w-[80px] sm:px-3 sm:py-1.5" title={sa.name}>
                        {sa.name}
                      </td>
                      {sa.counts.map((count, idx) => (
                        <DurationCell
                          key={`${area.name}-${sa.name}-${idx}`}
                          value={count}
                          bucketIndex={idx}
                          onClick={() => handleCellClick(area.name, sa.name, idx, count)}
                          ariaLabel={`Lihat detail ${count} tiket untuk ${sa.name}, bucket ${buckets[idx] ?? '-'}`}
                        />
                      ))}
                      {showTotal && (
                        <td className="border-b border-(--border) px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-(--text-primary) sm:px-2 sm:text-[11px]">
                          {saTotal > 0 ? saTotal : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className="sticky bottom-0 z-10 border-t border-(--border) bg-(--surface-2) font-mono text-[10px] font-semibold text-(--text-primary) sm:text-[11px]">
            <td className="sticky left-0 z-10 bg-(--surface-2) px-2 py-1 text-right tracking-[0.16em] uppercase text-(--text-muted) sm:px-3 sm:py-1.5">
              Total
            </td>
            {totals.map((total, idx) => (
              <td
                key={`total-${idx}`}
                className={`px-1 py-0.75 text-center sm:px-2 sm:py-1.5 ${BUCKET_HEADER_COLORS[idx] ?? 'bg-(--surface-3) text-(--text-muted)'}`}
              >
                {total > 0 ? total : ''}
              </td>
            ))}
            {showTotal && (
              <td className="bg-(--surface-3) px-1 py-0.75 text-center text-(--text-muted) sm:px-2 sm:py-1.5">
                {totals.reduce((s, v) => s + v, 0) > 0 ? totals.reduce((s, v) => s + v, 0) : '-'}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
