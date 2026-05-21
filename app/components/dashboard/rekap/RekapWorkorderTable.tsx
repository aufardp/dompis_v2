import { Fragment } from 'react';

interface SegCount { open: number; close: number; }

interface WorkzoneRow {
  workzone: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

const SEGMENTS = [
  { key: 'diamond', label: 'Diamond', group: 'b2c' as const },
  { key: 'platinum', label: 'Platinum', group: 'b2c' as const },
  { key: 'goldReg', label: 'Gold+Reg', group: 'b2c' as const },
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

function loadTone(open: number, teknisi: number): string {
  if (open === 0) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (teknisi === 0) return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';
  const ratio = open / teknisi;
  if (ratio >= 6) return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';
  if (ratio >= 3) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300';
}

export default function RekapWorkorderTable({ rows }: RekapTableProps) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Tidak ada data workorder</div>;
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

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-slate-950 dark:text-slate-50">Service Area Performance</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Open, close, teknisi, dan distribusi segment harian</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">Open {totals.open}</span>
          <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Close {totals.close}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-white">
              <th className="sticky left-0 z-30 w-[220px] bg-slate-950 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Service Area</th>
              <th className="w-20 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Open</th>
              <th className="w-20 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Close</th>
              <th className="w-20 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Total</th>
              <th className="w-20 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Tek</th>
              <th className="w-24 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Load</th>
              <th className="w-20 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide" rowSpan={2}>Close %</th>
              <th className="bg-sky-900 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide" colSpan={10}>B2C</th>
              <th className="bg-teal-900 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide" colSpan={6}>B2B</th>
            </tr>
            <tr className="border-b border-slate-800 bg-slate-900 text-slate-200">
              {SEGMENTS.map((segment) => (
                <th key={segment.key} className="px-2 py-2 text-center text-[10px] font-semibold" colSpan={2}>{segment.label}</th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left dark:bg-slate-900">Area / SA</th>
              <th colSpan={6} />
              {SEGMENTS.map((segment) => (
                <Fragment key={`${segment.key}-labels`}>
                  <th className="px-2 py-2 text-center font-semibold">Op</th>
                  <th className="px-2 py-2 text-center font-semibold">Cl</th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {Array.from(areaGroups.entries()).map(([area, areaRows]) => {
              const areaOpen = areaRows.reduce((sum, row) => sum + row.totalOpen, 0);
              const areaClose = areaRows.reduce((sum, row) => sum + row.totalClose, 0);

              return (
                <Fragment key={area}>
                  <tr className="border-y border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                    <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2 dark:bg-slate-900">
                      <span className="font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{area}</span>
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-red-700 dark:text-red-300">{areaOpen}</td>
                    <td className="px-2 py-2 text-center font-bold text-emerald-700 dark:text-emerald-300">{areaClose}</td>
                    <td className="px-2 py-2 text-center font-bold text-slate-700 dark:text-slate-200">{areaOpen + areaClose}</td>
                    <td colSpan={3 + SEGMENTS.length * 2} />
                  </tr>

                  {areaRows.map((row) => {
                    const closeRate = row.grandTotal > 0 ? Math.round((row.totalClose / row.grandTotal) * 100) : 0;
                    const loadClass = loadTone(row.totalOpen, row.teknisiMasuk);

                    return (
                      <tr key={row.saName} className="border-b border-slate-100 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2.5 dark:bg-slate-950">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-950 dark:text-slate-50" title={row.saName}>{row.saName}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{row.workzones.length} workzone</p>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono font-bold text-red-700 dark:text-red-300">{row.totalOpen}</td>
                        <td className="px-2 py-2.5 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">{row.totalClose}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-700 dark:text-slate-300">{row.grandTotal}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-700 dark:text-slate-300">{row.teknisiMasuk}</td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`inline-flex min-w-14 justify-center rounded px-2 py-1 font-mono font-bold ${loadClass}`}>
                            {row.woPerTeknisi}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">{closeRate}%</td>

                        {SEGMENTS.map((segment) => {
                          const data = getSegment(row, segment);
                          return (
                            <Fragment key={`${row.saName}-${segment.key}`}>
                              <td className="px-2 py-2.5 text-center font-mono text-red-700 dark:text-red-300">{formatCell(data.open)}</td>
                              <td className="px-2 py-2.5 text-center font-mono text-emerald-700 dark:text-emerald-300">{formatCell(data.close)}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-slate-950 text-white">
              <td className="sticky left-0 z-20 bg-slate-950 px-3 py-3 text-right font-bold uppercase tracking-wide">Total</td>
              <td className="px-2 py-3 text-center font-mono font-bold text-red-300">{totals.open}</td>
              <td className="px-2 py-3 text-center font-mono font-bold text-emerald-300">{totals.close}</td>
              <td className="px-2 py-3 text-center font-mono font-bold">{totals.grand}</td>
              <td className="px-2 py-3 text-center font-mono font-bold">{totals.teknisi}</td>
              <td className="px-2 py-3 text-center font-mono font-bold">{totals.teknisi > 0 ? (totals.open / totals.teknisi).toFixed(1) : '0.0'}</td>
              <td className="px-2 py-3 text-center text-[11px] font-bold">{totals.grand > 0 ? Math.round((totals.close / totals.grand) * 100) : 0}%</td>
              {SEGMENTS.map((segment) => {
                const data = totals.segments.get(segment.key)!;
                return (
                  <Fragment key={`total-${segment.key}`}>
                    <td className="px-2 py-3 text-center font-mono font-bold text-red-300">{data.open}</td>
                    <td className="px-2 py-3 text-center font-mono font-bold text-emerald-300">{data.close}</td>
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
