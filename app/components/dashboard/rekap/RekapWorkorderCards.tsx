'use client';

import type { RefObject } from 'react';
import { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Users } from 'lucide-react';
import clsx from 'clsx';
import MobileDetailDrawer from './MobileDetailDrawer';
import ClickableCount from './ClickableCount';
import {
  buildSummaryCellSpec,
  type RekapCellSpec,
} from './cellSpec';

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
interface SegmentTotal {
  b2c: SegCount;
  b2b: SegCount;
}

interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  segmentTotal?: SegmentTotal;
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
  segmentTotal?: SegmentTotal;
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface RekapCardsProps {
  rows: SARow[];
  captureTargetRef?: RefObject<HTMLDivElement | null>;
  detailMode?: string;
  onCellClick?: (spec: RekapCellSpec) => void;
}

// Rincian B2B/B2C kecil di bawah angka Open/Close utama pada kartu SA.
function SegmentCaption({ b2b, b2c }: { b2b: number; b2c: number }) {
  if (b2b === 0 && b2c === 0) return null;
  return (
    <span className='mt-0.5 block text-[9px] font-medium whitespace-nowrap text-(--text-muted)'>
      B2B {b2b} · B2C {b2c}
    </span>
  );
}

function closeRate(row: SARow, close?: number): number {
  const closeValue = close ?? row.totalClose;
  return row.grandTotal > 0
    ? Math.round((closeValue / row.grandTotal) * 100)
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

function getDisplayedOpen(
  open: number,
  close: number,
  total: number | undefined,
  isCustomerMode: boolean,
): number {
  if (isCustomerMode) {
    return Math.max((total ?? open + close) - close, 0);
  }
  return open;
}

function getDisplayedClose(
  open: number,
  close: number,
  total: number | undefined,
  isCustomerMode: boolean,
): number {
  if (isCustomerMode) {
    return Math.max(
      (total ?? open + close) - getDisplayedOpen(open, close, total, true),
      0,
    );
  }
  return close;
}

export default function RekapWorkorderCards({
  rows,
  captureTargetRef,
  detailMode,
  onCellClick,
}: RekapCardsProps) {
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

  const isCustomerMode = detailMode === 'kpi_customer';

  if (rows.length === 0) {
    return (
      <div className='py-12 text-center text-sm text-(--text-muted)'>
        Tidak ada data workorder
      </div>
    );
  }

  return (
    <>
      <div
        ref={captureTargetRef}
        data-rekap-capture-root='true'
        className='space-y-4'
      >
        {groupedRows.map(([area, areaRows]) => {
          const isOpen = openAreas.has(area);
          const areaOpen = areaRows.reduce(
            (sum, row) =>
              sum +
              getDisplayedOpen(
                row.totalOpen,
                row.totalClose,
                row.grandTotal,
                isCustomerMode,
              ),
            0,
          );
          const areaClose = areaRows.reduce(
            (sum, row) =>
              sum +
              getDisplayedClose(
                row.totalOpen,
                row.totalClose,
                row.grandTotal,
                isCustomerMode,
              ),
            0,
          );
          const areaTotal = areaOpen + areaClose;
          return (
            <section
              key={area}
              className='overflow-hidden rounded-[26px] border border-(--border) bg-(--surface) shadow-sm'
            >
              <button
                type='button'
                onClick={() => toggleArea(area)}
                className='flex w-full items-center justify-between gap-3 border-b border-(--border) px-4 py-3 text-left'
              >
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <MapPin className='h-4 w-4 text-(--text-muted)' />
                    <h3 className='truncate text-[10px] font-semibold tracking-[0.2em] text-(--text-muted) uppercase'>
                      {area}
                    </h3>
                  </div>
                  <p className='mt-1 text-[11px] text-(--text-secondary)'>
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
                      const displayOpen = getDisplayedOpen(
                        row.totalOpen,
                        row.totalClose,
                        row.grandTotal,
                        isCustomerMode,
                      );
                      const displayClose = getDisplayedClose(
                        row.totalOpen,
                        row.totalClose,
                        row.grandTotal,
                        isCustomerMode,
                      );
                      const toneColor = loadToneColor(
                        displayOpen,
                        row.teknisiMasuk,
                      );
                      const cr = closeRate(row, displayClose);
                      return (
                        <div
                          key={row.saName}
                          role='button'
                          tabIndex={0}
                          onClick={() => setSelectedRow(row)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedRow(row);
                            }
                          }}
                          className='group w-full cursor-pointer rounded-[22px] border border-(--border) bg-(--bg) p-3.5 text-left transition-colors hover:border-blue-500/20 hover:bg-(--surface-2) focus:ring-2 focus:ring-blue-500/40 focus:outline-none'
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <p className='truncate text-[13px] font-semibold text-(--text-primary)'>
                                {row.saName}
                              </p>
                              <div className='mt-1 flex flex-wrap items-center gap-2 text-[10px] text-(--text-muted)'>
                                <span className='inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5'>
                                  <Users className='h-3 w-3' />
                                  {row.teknisiMasuk} teknisi
                                </span>
                              </div>
                            </div>
                            <span
                              className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--surface) font-mono text-[10px] font-bold'
                              style={{ color: toneColor }}
                            >
                              {cr}%
                            </span>
                          </div>

                          <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                            <div className='rounded-[20px] border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Open
                              </p>
                              <ClickableCount
                                count={displayOpen}
                                spec={buildSummaryCellSpec(detailMode, 'open', {
                                  area: row.area,
                                  sa: row.saName,
                                })}
                                onCellClick={onCellClick}
                                className='mt-1 block text-[1.05rem] leading-none font-semibold text-rose-600 dark:text-rose-300 tabular-nums'
                              />
                              <SegmentCaption b2b={row.segmentTotal?.b2b.open ?? 0} b2c={row.segmentTotal?.b2c.open ?? 0} />
                            </div>
                            <div className='rounded-[20px] border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Close
                              </p>
                              <ClickableCount
                                count={displayClose}
                                spec={buildSummaryCellSpec(detailMode, 'close', {
                                  area: row.area,
                                  sa: row.saName,
                                })}
                                onCellClick={onCellClick}
                                className='mt-1 block text-[1.05rem] leading-none font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums'
                              />
                              <SegmentCaption b2b={row.segmentTotal?.b2b.close ?? 0} b2c={row.segmentTotal?.b2c.close ?? 0} />
                            </div>
                            <div className='rounded-[20px] border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Close %
                              </p>
                              <p className='mt-1 text-[1.05rem] leading-none font-semibold text-(--text-primary) tabular-nums'>
                                {cr}%
                              </p>
                            </div>
                            <div className='rounded-[20px] border border-(--border) bg-(--surface) px-2.5 py-2'>
                              <p className='text-[9px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                                Load
                              </p>
                              <span
                                className='mt-1 inline-flex rounded-full border border-(--border) bg-(--bg) px-2 py-1 font-mono text-[0.95rem] font-bold tabular-nums'
                                style={{
                                  background: `${toneColor}18`,
                                  color: toneColor,
                                }}
                              >
                                {row.woPerTeknisi}
                              </span>
                            </div>
                          </div>
                        </div>
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
