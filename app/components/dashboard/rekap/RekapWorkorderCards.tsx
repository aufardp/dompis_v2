'use client';

import { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Users } from 'lucide-react';
import clsx from 'clsx';
import MobileDetailDrawer from './MobileDetailDrawer';

interface SegCount {
  open: number;
  close: number;
}

interface DetailGroup {
  b2c: Record<string, SegCount>;
  b2b: Record<string, SegCount>;
}

interface BucketRecord {
  kpiCustomer: SegCount;
  kpiProactive: SegCount;
  nonKpiUnspec: SegCount;
  nonTechnical: SegCount;
  sqmUpdate: SegCount;
  obsolete: SegCount;
}

interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface RekapCardsProps {
  rows: SARow[];
}

function closeRate(row: SARow): number {
  return row.grandTotal > 0
    ? Math.round((row.totalClose / row.grandTotal) * 100)
    : 0;
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
  const [openAreas, setOpenAreas] = useState<Set<string>>(
    () => new Set(areaNames),
  );

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
    return (
      <div className='py-12 text-center text-sm text-(--text-muted)'>
        Tidak ada data workorder
      </div>
    );
  }

  return (
    <>
      <div className='space-y-4'>
        {groupedRows.map(([area, areaRows]) => {
          const isOpen = openAreas.has(area);
          const areaOpen = areaRows.reduce((sum, row) => sum + row.totalOpen, 0);
          const areaClose = areaRows.reduce((sum, row) => sum + row.totalClose, 0);
          const areaTotal = areaOpen + areaClose;
          return (
            <section
              key={area}
              className='overflow-hidden rounded-[24px] border border-(--border) bg-(--surface) shadow-sm'
            >
              <button
                type='button'
                onClick={() => toggleArea(area)}
                className='flex w-full items-center justify-between gap-3 border-b border-(--border) px-4 py-3 text-left'
              >
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <MapPin className='h-4 w-4 text-(--text-muted)' />
                    <h3 className='truncate text-[11px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                      {area}
                    </h3>
                  </div>
                  <p className='mt-1 text-xs text-(--text-secondary)'>
                    {areaRows.length} service area
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='rounded-full border border-(--border) bg-(--bg) px-2.5 py-1 text-[10px] font-semibold text-(--text-secondary)'>
                    {areaTotal.toLocaleString('id-ID')} WO
                  </span>
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
                <div className='min-h-0 overflow-hidden'>
                  <div className='space-y-3 p-3'>
                    {areaRows.map((row) => {
                      const toneColor = loadToneColor(
                        row.totalOpen,
                        row.teknisiMasuk,
                      );
                      const cr = closeRate(row);
                      return (
                        <button
                          key={row.saName}
                          onClick={() => setSelectedRow(row)}
                          className='group w-full rounded-2xl border border-(--border) bg-(--bg) p-4 text-left transition-colors hover:border-blue-500/20 hover:bg-(--surface-2)'
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <p className='truncate text-sm font-semibold text-(--text-primary)'>
                                {row.saName}
                              </p>
                              <div className='mt-1 flex flex-wrap items-center gap-2 text-[10px] text-(--text-muted)'>
                                <span className='inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5'>
                                  <Users className='h-3 w-3' />
                                  {row.teknisiMasuk} teknisi
                                </span>
                                <span className='inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5'>
                                  {row.workzones.length} workzone
                                </span>
                              </div>
                            </div>
                            <span
                              className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--surface) font-mono text-[11px] font-bold'
                              style={{ color: toneColor }}
                            >
                              {cr}%
                            </span>
                          </div>

                          <div className='mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                            <div className='rounded-2xl border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Open
                              </p>
                              <p className='mt-1 text-lg font-semibold text-rose-600 dark:text-rose-300'>
                                {row.totalOpen}
                              </p>
                            </div>
                            <div className='rounded-2xl border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Close
                              </p>
                              <p className='mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-300'>
                                {row.totalClose}
                              </p>
                            </div>
                            <div className='rounded-2xl border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Close %
                              </p>
                              <p className='mt-1 text-lg font-semibold text-(--text-primary)'>
                                {cr}%
                              </p>
                            </div>
                            <div className='rounded-2xl border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Load
                              </p>
                              <span
                                className='mt-1 inline-flex rounded-full border border-(--border) bg-(--bg) px-2 py-1 font-mono text-sm font-bold'
                                style={{
                                  background: `${toneColor}18`,
                                  color: toneColor,
                                }}
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
        <MobileDetailDrawer
          row={selectedRow}
          isOpen={!!selectedRow}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </>
  );
}
