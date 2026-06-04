import { Fragment, useState, useCallback, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface SegCount {
  open: number;
  close: number;
}

interface WorkzoneRow {
  workzone: string;
  b2c: {
    diamond: SegCount;
    platinum: SegCount;
    gold: SegCount;
    reg: SegCount;
    sqmB2c: SegCount;
  };
  b2b: {
    datin: SegCount;
    nonDatin: SegCount;
    sqmB2b: SegCount;
    tsel: SegCount;
  };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  b2c: {
    diamond: SegCount;
    platinum: SegCount;
    gold: SegCount;
    reg: SegCount;
    sqmB2c: SegCount;
  };
  b2b: {
    datin: SegCount;
    nonDatin: SegCount;
    sqmB2b: SegCount;
    tsel: SegCount;
  };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

const SEGMENTS = [
  { key: 'diamond', label: 'Diamond', group: 'b2c' as const },
  { key: 'platinum', label: 'Platinum', group: 'b2c' as const },
  { key: 'gold', label: 'Gold', group: 'b2c' as const },
  { key: 'reg', label: 'Reg', group: 'b2c' as const },
  { key: 'sqmB2c', label: 'SQM B2C', group: 'b2c' as const },
  { key: 'datin', label: 'DATIN', group: 'b2b' as const },
  { key: 'nonDatin', label: 'Non-Datin', group: 'b2b' as const },
  { key: 'sqmB2b', label: 'SQM B2B', group: 'b2b' as const },
  { key: 'tsel', label: 'TSEL', group: 'b2b' as const },
];

function getSegment(row: SARow, segment: (typeof SEGMENTS)[number]): SegCount {
  return segment.group === 'b2c'
    ? row.b2c[segment.key as keyof SARow['b2c']]
    : row.b2b[segment.key as keyof SARow['b2b']];
}

function formatCell(value: number): string {
  return value > 0 ? String(value) : '-';
}

function loadToneStyle(open: number, teknisi: number): React.CSSProperties {
  if (open === 0) return { color: '#22c55e', fontWeight: 600 };
  if (teknisi === 0) return { color: '#ef4444', fontWeight: 700 };
  const ratio = open / teknisi;
  if (ratio >= 6) return { color: '#ef4444', fontWeight: 700 };
  if (ratio >= 3) return { color: '#f59e0b', fontWeight: 600 };
  return { color: '#3b82f6' };
}

interface RekapTableProps {
  rows: SARow[];
  timestamp?: string;
}

export default function RekapWorkorderTable({ rows }: RekapTableProps) {
  const areaNames = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(row.area);
    return Array.from(set);
  }, [rows]);

  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set(areaNames));

  const toggleArea = useCallback((name: string) => {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (rows.length === 0) {
    return (
      <div className='py-12 text-center text-sm text-(--text-muted)'>
        Tidak ada data workorder
      </div>
    );
  }

  const areaGroups = new Map<string, SARow[]>();
  for (const row of rows) {
    if (!areaGroups.has(row.area)) areaGroups.set(row.area, []);
    areaGroups.get(row.area)!.push(row);
  }

  const totals = {
    open: rows.reduce((sum, row) => sum + row.totalOpen, 0),
    close: rows.reduce((sum, row) => sum + row.totalClose, 0),
    grand: rows.reduce((sum, row) => sum + row.grandTotal, 0),
    teknisi: rows.reduce((sum, row) => sum + row.teknisiMasuk, 0),
    segments: new Map<string, SegCount>(),
  };

  for (const segment of SEGMENTS) {
    totals.segments.set(segment.key, { open: 0, close: 0 });
  }
  for (const row of rows) {
    for (const segment of SEGMENTS) {
      const data = getSegment(row, segment);
      const total = totals.segments.get(segment.key)!;
      total.open += data.open;
      total.close += data.close;
    }
  }

  const maxWorkzoneOpen = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const wz of row.workzones) {
        if (wz.totalOpen > max) max = wz.totalOpen;
      }
    }
    return max;
  }, [rows]);

  return (
    <div className='overflow-hidden rounded-lg border border-(--border) bg-(--surface)'>
      <div className='flex items-center justify-between border-b border-(--border) px-4 py-3'>
        <div>
          <p className='text-sm font-bold text-(--text-primary)'>
            Service Area Performance
          </p>
          <p className='text-xs text-(--text-secondary)'>
            Open, close, teknisi, dan distribusi segment harian
          </p>
        </div>
        <div className='flex items-center gap-2 text-xs'>
          <span className='rounded bg-red-50 px-2 py-1 font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300'>
            Open {totals.open}
          </span>
          <span className='rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'>
            Close {totals.close}
          </span>
        </div>
      </div>

      <div className='overflow-x-auto'>
        <table className='w-full min-w-330 border-collapse text-xs'>
          <thead>
            <tr className='border-b border-(--border) bg-(--surface-2) text-(--text-primary)'>
              <th
                className='sticky left-0 z-30 w-55 bg-(--surface-2) px-3 py-3 text-left text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Service Area
              </th>
              <th
                className='w-20 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Open
              </th>
              <th
                className='w-20 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Close
              </th>
              <th
                className='w-20 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Total
              </th>
              <th
                className='w-20 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Tek
              </th>
              <th
                className='w-24 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Load
              </th>
              <th
                className='w-20 px-2 py-3 text-center text-[11px] font-bold tracking-wide uppercase'
                rowSpan={2}
              >
                Close %
              </th>
              <th
                className='bg-blue-600 px-2 py-2 text-center text-[11px] font-black tracking-wider text-white uppercase'
                colSpan={10}
              >
                B2C
              </th>
              <th
                className='bg-cyan-600 px-2 py-2 text-center text-[11px] font-black tracking-wider text-white uppercase'
                colSpan={8}
              >
                B2B
              </th>
            </tr>
            <tr className='border-b border-(--border) text-(--text-secondary) bg-(--surface-2)'>
              {SEGMENTS.map((segment) => (
                <th
                  key={segment.key}
                  className='px-2 py-2 text-center text-[10px] font-semibold'
                  colSpan={2}
                >
                  {segment.label}
                </th>
              ))}
            </tr>
            <tr className='border-b border-(--border) bg-(--surface-2) text-(--text-muted)'>
              <th className='sticky left-0 z-20 bg-(--surface-2) px-3 py-2 text-left'>
                Area / SA
              </th>
              <th colSpan={6} />
              {SEGMENTS.map((segment) => (
                <Fragment key={`${segment.key}-labels`}>
                  <th className='px-2 py-2 text-center font-semibold'>Open</th>
                  <th className='px-2 py-2 text-center font-semibold'>Close</th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {Array.from(areaGroups.entries()).map(([area, areaRows]) => {
              const isOpen = openAreas.has(area);
              const areaOpen = areaRows.reduce(
                (sum, row) => sum + row.totalOpen,
                0,
              );
              const areaClose = areaRows.reduce(
                (sum, row) => sum + row.totalClose,
                0,
              );

              return (
                <Fragment key={area}>
                  <tr
                    className='border-y border-(--border) bg-(--surface-2) cursor-pointer select-none'
                    onClick={() => toggleArea(area)}
                  >
                    <td className='sticky left-0 z-10 bg-(--surface-2) px-3 py-2'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-bold tracking-wide text-(--text-primary) uppercase'>
                          {area}
                        </span>
                        <ChevronDown
                          size={14}
                          className={clsx(
                            'shrink-0 text-(--text-muted) transition-transform duration-200',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </div>
                    </td>
                    <td className='px-2 py-2 text-center font-bold text-red-600'>{areaOpen}</td>
                    <td className='px-2 py-2 text-center font-bold text-emerald-600'>{areaClose}</td>
                    <td className='px-2 py-2 text-center font-bold text-(--text-primary)'>
                      {areaOpen + areaClose}
                    </td>
                    <td className='px-2 py-2 text-center font-mono text-(--text-secondary)'>
                      {areaRows.reduce((sum, r) => sum + r.teknisiMasuk, 0)}
                    </td>
                    <td className='px-2 py-2 text-center'>
                      {(() => {
                        const tek = areaRows.reduce((sum, r) => sum + r.teknisiMasuk, 0);
                        const load = tek > 0 ? (areaOpen / tek).toFixed(1) : '0.0';
                        return (
                          <span
                            className='inline-flex min-w-14 justify-center rounded px-2 py-1 font-mono font-bold'
                            style={loadToneStyle(areaOpen, tek)}
                          >
                            {load}
                          </span>
                        );
                      })()}
                    </td>
                    <td className='px-2 py-2 text-center text-[11px] font-semibold text-(--text-secondary)'>
                      {areaOpen + areaClose > 0
                        ? Math.round((areaClose / (areaOpen + areaClose)) * 100)
                        : 0}%
                    </td>
                    {SEGMENTS.map((segment) => {
                      const areaSeg = areaRows.reduce(
                        (acc, row) => {
                          const data = getSegment(row, segment);
                          return { open: acc.open + data.open, close: acc.close + data.close };
                        },
                        { open: 0, close: 0 },
                      );
                      return (
                        <Fragment key={`area-${area}-${segment.key}`}>
                          <td className='px-2 py-2 text-center font-mono text-red-600 font-bold'>
                            {formatCell(areaSeg.open)}
                          </td>
                          <td className='px-2 py-2 text-center font-mono text-emerald-600 font-bold'>
                            {formatCell(areaSeg.close)}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>

                  {isOpen && areaRows.map((row) => {
                    const closeRate =
                      row.grandTotal > 0
                        ? Math.round((row.totalClose / row.grandTotal) * 100)
                        : 0;

                    return (
                      <Fragment key={row.saName}>
                        {/* SA row */}
                        <tr className='border-b border-(--border) bg-(--surface) hover:bg-(--surface-2)'>
                          <td className='sticky left-0 z-10 bg-(--surface) px-3 py-2.5'>
                            <div className='min-w-0'>
                              <p className='truncate font-bold text-(--text-primary)' title={row.saName}>
                                {row.saName}
                              </p>
                              <p className='text-[11px] text-(--text-secondary)'>
                                {row.workzones.length} workzone
                              </p>
                            </div>
                          </td>
                          <td className='px-2 py-2.5 text-center font-mono font-bold text-red-600'>
                            {row.totalOpen}
                          </td>
                          <td className='px-2 py-2.5 text-center font-mono font-bold text-emerald-600'>
                            {row.totalClose}
                          </td>
                          <td className='px-2 py-2.5 text-center font-mono text-(--text-secondary)'>
                            {row.grandTotal}
                          </td>
                          <td className='px-2 py-2.5 text-center font-mono text-(--text-secondary)'>
                            {row.teknisiMasuk}
                          </td>
                          <td className='px-2 py-2.5 text-center'>
                            <span
                              className="inline-flex min-w-14 justify-center rounded px-2 py-1 font-mono font-bold"
                              style={loadToneStyle(row.totalOpen, row.teknisiMasuk)}
                            >
                              {row.woPerTeknisi}
                            </span>
                          </td>
                          <td className='px-2 py-2.5 text-center text-[11px] font-semibold text-(--text-secondary)'>
                            {closeRate}%
                          </td>

                          {SEGMENTS.map((segment) => {
                            const data = getSegment(row, segment);
                            return (
                              <Fragment key={`${row.saName}-${segment.key}`}>
                                <td className='px-2 py-2.5 text-center font-mono text-red-600'>
                                  {formatCell(data.open)}
                                </td>
                                <td className='px-2 py-2.5 text-center font-mono text-emerald-600'>
                                  {formatCell(data.close)}
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>

                        {/* Workzone sub-rows with load bar */}
                        {row.workzones.map((wz) => (
                          <tr key={`${row.saName}-${wz.workzone}`} className='border-b border-(--border) bg-(--surface-2)/50'>
                            <td className='sticky left-0 bg-(--surface-2) pl-8 pr-3 py-1.5'>
                              <div className='flex items-center gap-2'>
                                <div className='h-1 w-16 rounded-full bg-(--surface-3) overflow-hidden'>
                                  <div
                                    className='h-full rounded-full bg-blue-500'
                                    style={{ width: `${Math.min((wz.totalOpen / Math.max(maxWorkzoneOpen, 1)) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className='text-[11px] text-(--text-secondary) truncate max-w-[120px]'>{wz.workzone}</span>
                              </div>
                            </td>
                            <td className='px-2 py-1.5 text-center font-mono text-[11px] text-red-500'>{formatCell(wz.totalOpen)}</td>
                            <td className='px-2 py-1.5 text-center font-mono text-[11px] text-emerald-500'>{formatCell(wz.totalClose)}</td>
                            <td colSpan={5 + SEGMENTS.length * 2} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className='bg-(--surface-2) text-(--text-primary) font-bold border-t-2 border-(--border)'>
              <td className='sticky left-0 z-20 bg-(--surface-2) px-3 py-3 text-right tracking-wide uppercase'>
                Total
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold text-red-500'>{totals.open}</td>
              <td className='px-2 py-3 text-center font-mono font-bold text-emerald-500'>{totals.close}</td>
              <td className='px-2 py-3 text-center font-mono font-bold'>{totals.grand}</td>
              <td className='px-2 py-3 text-center font-mono font-bold'>{totals.teknisi}</td>
              <td className='px-2 py-3 text-center font-mono font-bold'>
                {totals.teknisi > 0 ? (totals.open / totals.teknisi).toFixed(1) : '0.0'}
              </td>
              <td className='px-2 py-3 text-center text-[11px] font-bold'>
                {totals.grand > 0 ? Math.round((totals.close / totals.grand) * 100) : 0}%
              </td>
              {SEGMENTS.map((segment) => {
                const data = totals.segments.get(segment.key)!;
                return (
                  <Fragment key={`total-${segment.key}`}>
                    <td className='px-2 py-3 text-center font-mono font-bold text-red-500'>{data.open}</td>
                    <td className='px-2 py-3 text-center font-mono font-bold text-emerald-500'>{data.close}</td>
                  </Fragment>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
