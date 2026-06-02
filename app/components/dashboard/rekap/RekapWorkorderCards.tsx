'use client';

import { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Users } from 'lucide-react';
import clsx from 'clsx';
import MobileDetailDrawer from './MobileDetailDrawer';

interface SegCount { open: number; close: number; }

interface WorkzoneRow {
  workzone: string;
  b2c: { diamond: SegCount; platinum: SegCount; gold: SegCount; reg: SegCount; sqmB2c: SegCount; };
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
  b2c: { diamond: SegCount; platinum: SegCount; gold: SegCount; reg: SegCount; sqmB2c: SegCount; };
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

function loadToneColor(open: number, teknisi: number): string {
  if (open === 0) return '#22c55e';
  if (teknisi === 0) return '#ef4444';
  const ratio = open / teknisi;
  if (ratio >= 6) return '#ef4444';
  if (ratio >= 3) return '#f59e0b';
  return '#3b82f6';
}

export default function RekapWorkorderCards({ rows }: RekapCardsProps) {
  const [selectedRow, setSelectedRow] = useState<SARow | null>(null);
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

  const groupedRows = useMemo(() => {
    const map = new Map<string, SARow[]>();
    for (const row of rows) {
      if (!map.has(row.area)) map.set(row.area, []);
      map.get(row.area)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-(--text-muted)">Tidak ada data workorder</div>;
  }

  return (
    <>
      <div className="space-y-5">
        {groupedRows.map(([area, areaRows]) => {
          const isOpen = openAreas.has(area);
          return (
            <section key={area} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleArea(area)}
                className="flex w-full items-center justify-between px-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-(--text-muted)" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-(--text-muted)">{area}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--text-muted)">{areaRows.length} SA</span>
                  <ChevronDown
                    size={14}
                    className={clsx(
                      'text-(--text-muted) transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </div>
              </button>

              <div
                className={clsx(
                  'grid transition-[grid-template-rows] duration-300 ease-out',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-3">
                    {areaRows.map((row) => {
                      const toneColor = loadToneColor(row.totalOpen, row.teknisiMasuk);
                      const cr = closeRate(row);
                      return (
                        <button
                          key={row.saName}
                          onClick={() => setSelectedRow(row)}
                          className="w-full rounded-lg border border-(--border) bg-(--surface) p-4 text-left transition hover:border-(--border) hover:bg-(--surface-2)"
                        >
                          {/* Card header with accent bar */}
                          <div className="flex items-center justify-between gap-2 border-b border-(--border) pb-2.5" style={{ background: `${toneColor}10` }}>
                            <div>
                              <p className="text-xs font-bold text-(--text-primary)">{row.saName}</p>
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-(--text-muted)">
                                <Users className="h-3.5 w-3.5" />
                                <span>{row.teknisiMasuk} teknisi</span>
                                <span>{row.workzones.length} workzone</span>
                              </div>
                            </div>
                            {/* Closure ring */}
                            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90 flex-shrink-0">
                              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
                              <circle
                                cx="18" cy="18" r="14" fill="none"
                                stroke={cr >= 80 ? '#22c55e' : cr >= 50 ? '#f59e0b' : '#ef4444'}
                                strokeWidth="4"
                                strokeDasharray={`${(cr / 100) * 87.96} 87.96`}
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">Open</p>
                              <p className="mt-1 text-lg font-bold text-red-600">{row.totalOpen}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">Close</p>
                              <p className="mt-1 text-lg font-bold text-emerald-600">{row.totalClose}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">Close %</p>
                              <p className="mt-1 text-lg font-bold text-(--text-primary)">{cr}%</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">Load</p>
                              <span
                                className="mt-1 inline-flex rounded px-2 py-1 font-mono text-sm font-bold"
                                style={{ background: `${toneColor}18`, color: toneColor }}
                              >
                                {row.woPerTeknisi}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {selectedRow && (
        <MobileDetailDrawer row={selectedRow} isOpen={!!selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </>
  );
}
