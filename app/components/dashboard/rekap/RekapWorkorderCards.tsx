'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, MapPin, Users } from 'lucide-react';
import MobileDetailDrawer from './MobileDetailDrawer';

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
}

interface RekapCardsProps {
  rows: SARow[];
}

function closeRate(row: SARow): number {
  return row.grandTotal > 0 ? Math.round((row.totalClose / row.grandTotal) * 100) : 0;
}

function loadTone(row: SARow): string {
  if (row.totalOpen === 0) return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30';
  if (row.teknisiMasuk === 0) return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/30';
  const ratio = row.totalOpen / row.teknisiMasuk;
  if (ratio >= 6) return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/30';
  if (ratio >= 3) return 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30';
  return 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/30';
}

export default function RekapWorkorderCards({ rows }: RekapCardsProps) {
  const [selectedRow, setSelectedRow] = useState<SARow | null>(null);
  const groupedRows = useMemo(() => {
    const map = new Map<string, SARow[]>();
    for (const row of rows) {
      if (!map.has(row.area)) map.set(row.area, []);
      map.get(row.area)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Tidak ada data workorder</div>;
  }

  return (
    <>
      <div className="space-y-5">
        {groupedRows.map(([area, areaRows]) => (
          <section key={area} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{area}</h3>
              </div>
              <span className="text-xs text-slate-400">{areaRows.length} SA</span>
            </div>

            <div className="space-y-3">
              {areaRows.map((row) => (
                <button
                  key={row.saName}
                  onClick={() => setSelectedRow(row)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-slate-950 dark:text-slate-50">{row.saName}</h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        <span>{row.teknisiMasuk} teknisi</span>
                        <span>{row.workzones.length} workzone</span>
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open</p>
                      <p className="mt-1 text-lg font-bold text-red-600 dark:text-red-300">{row.totalOpen}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Close</p>
                      <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-300">{row.totalClose}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Close %</p>
                      <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{closeRate(row)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Load</p>
                      <span className={`mt-1 inline-flex rounded px-2 py-1 font-mono text-sm font-bold ${loadTone(row)}`}>
                        {row.woPerTeknisi}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedRow && (
        <MobileDetailDrawer row={selectedRow} isOpen={!!selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </>
  );
}

