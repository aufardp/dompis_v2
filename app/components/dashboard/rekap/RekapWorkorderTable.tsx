import type { RefObject } from 'react';
import { Fragment, useState, useCallback, useMemo } from 'react';
import { ChevronDown, Download, FileDown } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/app/components/ui/shadcn-button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover';
import type { CaptureFormat } from './captureElementAsImage';

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
  totalAll?: number;
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

type BucketKey = keyof BucketRecord;

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'kpiCustomer', label: 'Customer' },
  { key: 'kpiProactive', label: 'Proactive' },
  { key: 'nonKpiUnspec', label: 'Unspec' },
  { key: 'nonTechnical', label: 'Non Technical' },
  { key: 'sqmUpdate', label: 'SQM Update' },
  { key: 'obsolete', label: 'Obsolete' },
];

const B2C_DETAIL_TYPES = ['diamond', 'platinum', 'gold', 'reguler'];

const B2B_DETAIL_JENIS = ['datin', 'non-datin', 'tsel'];

const B2C_DETAIL_LABEL: Record<string, string> = {
  diamond: 'DIAMOND',
  platinum: 'PLATINUM',
  gold: 'GOLD',
  reguler: 'REGULER',
};

const DETAIL_GROUP_STYLE: Record<
  string,
  { band: string; subBand: string; text: string }
> = {
  b2c: {
    band: 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/12 dark:text-blue-200',
    subBand:
      'bg-blue-500/5 text-blue-700 dark:bg-blue-500/8 dark:text-blue-100',
    text: 'text-blue-700 dark:text-blue-200',
  },
  b2b: {
    band: 'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-200',
    subBand:
      'bg-cyan-500/5 text-cyan-700 dark:bg-cyan-500/8 dark:text-cyan-100',
    text: 'text-cyan-700 dark:text-cyan-200',
  },
  sqm: {
    band: 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/12 dark:text-violet-200',
    subBand:
      'bg-violet-500/5 text-violet-700 dark:bg-violet-500/8 dark:text-violet-100',
    text: 'text-violet-700 dark:text-violet-200',
  },
};

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

function getDetailCellValue(
  base: SegCount & { update?: number },
  label: string,
): number {
  const normalized = label.trim().toUpperCase();
  if (normalized === 'OPEN' || normalized === 'OPN') return base.open;
  if (normalized === 'CLOSE' || normalized === 'CLS') return base.close;
  if (normalized === 'UPDATE' || normalized === 'UPD') return base.update ?? 0;
  return 0;
}

interface RekapTableProps {
  rows: SARow[];
  timestamp?: string;
  detailMode?: string;
  captureTargetRef?: RefObject<HTMLTableElement | null>;
  onCapture?: (format: CaptureFormat) => void;
  isCapturing?: boolean;
  overviewSummary?: {
    total: number;
    open: number;
    assigned: number;
    close: number;
  };
  bucketSummary?: {
    total: number;
    open: number;
    assigned: number;
    close: number;
  };
  bucketBreakdown?: {
    kpiCustomer: { total: number; open: number; assigned: number; close: number };
    kpiProactive: { total: number; open: number; assigned: number; close: number };
    nonKpiUnspec: { total: number; open: number; assigned: number; close: number };
    nonTechnical: { total: number; open: number; assigned: number; close: number };
    sqmUpdate: { total: number; open: number; assigned: number; close: number };
    obsolete: { total: number; open: number; assigned: number; close: number };
  };
}

export default function RekapWorkorderTable({
  rows,
  detailMode,
  captureTargetRef,
  onCapture,
  isCapturing = false,
  overviewSummary,
  bucketSummary,
  bucketBreakdown,
}: RekapTableProps) {
  const areaNames = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(row.area);
    return Array.from(set);
  }, [rows]);

  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set());

  const toggleArea = useCallback((name: string) => {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const isDetail = detailMode !== undefined;
  const isAllMode = !isDetail;
  const isObsoleteMode = detailMode === 'obsolete';
  const isJenis2Mode =
    detailMode === 'kpi_proactive' || detailMode === 'sqm_update';
  const isUnspecMode = detailMode === 'non_kpi_unspec';
  const isCustomerMode = detailMode === 'kpi_customer';
  const tableCompact = true;
  const modeLabel =
    detailMode === 'kpi_customer'
      ? 'Customer detail view'
      : detailMode === 'kpi_proactive'
        ? 'Proactive detail view'
        : detailMode === 'non_kpi_unspec'
          ? 'Unspec detail view'
          : detailMode === 'sqm_update'
            ? 'SQM Update detail view'
            : detailMode === 'obsolete'
              ? 'Obsolete detail view'
              : 'Operational bucket view';

  const detailColumns = useMemo(() => {
    if (!isDetail) return null;
    if (isObsoleteMode) {
      return {
        groups: [
          {
            label: 'Obsolete',
            segment: 'obsolete' as any,
            keys: ['obsolete'],
            subLabels: ['Open', 'Close'],
          },
        ],
        totalCols: 2,
      };
    }
    if (isUnspecMode) {
      return {
        groups: [
          { label: 'B2C', segment: 'b2c' as const, keys: ['unspec'] },
          { label: 'B2B', segment: 'b2b' as const, keys: ['unspec-b2b'] },
        ],
        totalCols: 4,
      };
    }
    if (isCustomerMode) {
      return {
        groups: [
          { label: 'B2C', segment: 'b2c' as const, keys: B2C_DETAIL_TYPES },
          { label: 'B2B', segment: 'b2b' as const, keys: B2B_DETAIL_JENIS },
          {
            label: 'SQM',
            segment: 'sqm' as const,
            keys: ['sqm'],
            subLabels: ['OPN', 'CLS', 'UPD'],
          },
        ],
        totalCols:
          B2C_DETAIL_TYPES.length * 2 + B2B_DETAIL_JENIS.length * 2 + 3,
      };
    }
    if (isJenis2Mode) {
      const b2cSet = new Set<string>();
      const b2bSet = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row.detail.b2c)) b2cSet.add(key);
        for (const key of Object.keys(row.detail.b2b)) b2bSet.add(key);
      }
      const b2cKeys = Array.from(b2cSet).sort();
      const b2bKeys = Array.from(b2bSet).sort();
      return {
        groups: [
          { label: 'B2C', segment: 'b2c' as const, keys: b2cKeys },
          { label: 'B2B', segment: 'b2b' as const, keys: b2bKeys },
        ],
        totalCols: (b2cKeys.length + b2bKeys.length) * 2,
      };
    }
    return {
      groups: [
        { label: 'B2C', segment: 'b2c' as const, keys: B2C_DETAIL_TYPES },
        { label: 'B2B', segment: 'b2b' as const, keys: B2B_DETAIL_JENIS },
      ],
      totalCols: B2C_DETAIL_TYPES.length * 2 + B2B_DETAIL_JENIS.length * 2,
    };
  }, [
    isDetail,
    isJenis2Mode,
    isUnspecMode,
    isCustomerMode,
    isObsoleteMode,
    rows,
  ]);

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

  const isSameLabel = (a: string, b: string) =>
    a.trim().toUpperCase() === b.trim().toUpperCase();

  const getDisplayedOpen = (
    open: number,
    close: number,
    total?: number,
  ): number => {
    if (isCustomerMode) {
      return Math.max((total ?? open + close) - close, 0);
    }
    return open;
  };

  const getDisplayedClose = (
    open: number,
    close: number,
    total?: number,
  ): number => {
    if (isCustomerMode) {
      return Math.max((total ?? open + close) - getDisplayedOpen(open, close, total), 0);
    }
    return close;
  };

  const totals = {
    open: bucketSummary ? bucketSummary.open : rows.reduce((sum, row) => sum + row.totalOpen, 0),
    close: bucketSummary ? bucketSummary.close : rows.reduce((sum, row) => sum + row.totalClose, 0),
    grand: bucketSummary ? bucketSummary.total : rows.reduce((sum, row) => sum + row.grandTotal, 0),
    teknisi: rows.reduce((sum, row) => sum + row.teknisiMasuk, 0),
    buckets: new Map<BucketKey, SegCount>(),
  };
  if (isCustomerMode) {
    totals.open = Math.max(totals.grand - totals.close, 0);
  }
  if (isAllMode && bucketBreakdown) {
    totals.open = bucketBreakdown.kpiCustomer.open +
      bucketBreakdown.kpiProactive.open +
      bucketBreakdown.nonKpiUnspec.open +
      bucketBreakdown.nonTechnical.open +
      bucketBreakdown.sqmUpdate.open +
      bucketBreakdown.obsolete.open;
    totals.close = bucketBreakdown.kpiCustomer.close +
      bucketBreakdown.kpiProactive.close +
      bucketBreakdown.nonKpiUnspec.close +
      bucketBreakdown.nonTechnical.close +
      bucketBreakdown.sqmUpdate.close +
      bucketBreakdown.obsolete.close;
    totals.grand = bucketBreakdown.kpiCustomer.total +
      bucketBreakdown.kpiProactive.total +
      bucketBreakdown.nonKpiUnspec.total +
      bucketBreakdown.nonTechnical.total +
      bucketBreakdown.sqmUpdate.total +
      bucketBreakdown.obsolete.total;
  }

  const displayedTotalClose = isCustomerMode
    ? totals.grand - totals.open
    : totals.close;

  for (const bkt of BUCKETS) {
    totals.buckets.set(bkt.key, { open: 0, close: 0 });
  }
  if (isAllMode && bucketBreakdown) {
    const bucketMap = {
      kpiCustomer: bucketBreakdown.kpiCustomer,
      kpiProactive: bucketBreakdown.kpiProactive,
      nonKpiUnspec: bucketBreakdown.nonKpiUnspec,
      nonTechnical: bucketBreakdown.nonTechnical,
      sqmUpdate: bucketBreakdown.sqmUpdate,
      obsolete: bucketBreakdown.obsolete,
    } satisfies Record<BucketKey, { total: number; open: number; assigned: number; close: number }>;

    for (const bkt of BUCKETS) {
      const data = bucketMap[bkt.key];
      const total = totals.buckets.get(bkt.key)!;
      total.open = data.open;
      total.close = data.close;
    }
  } else {
    for (const row of rows) {
      for (const bkt of BUCKETS) {
        const data = row.buckets[bkt.key];
        const total = totals.buckets.get(bkt.key)!;
        total.open += data.open;
        total.close += data.close;
      }
    }
  }

  const maxWorkzoneOpen = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const wz of row.workzones) {
        const displayOpen = getDisplayedOpen(
          wz.totalOpen,
          wz.totalClose,
          wz.totalAll,
        );
        if (displayOpen > max) max = displayOpen;
      }
    }
    return max;
  }, [rows, isCustomerMode]);

  function renderDetailCells(
    row: {
      detail: DetailGroup;
      sqm?: { open: number; close: number; update: number };
      buckets?: BucketRecord;
    },
    prefix: string,
    bold = false,
  ) {
    if (!detailColumns) return null;
    return detailColumns.groups.flatMap((group, groupIndex) =>
      group.keys.map((key, keyIndex) => {
        const base =
          group.segment === 'obsolete'
            ? (row.buckets?.obsolete ?? { open: 0, close: 0 })
            : group.segment === 'sqm'
              ? (row.sqm ?? { open: 0, close: 0, update: 0 })
              : (row.detail[group.segment as keyof DetailGroup][key] ?? {
                  open: 0,
                  close: 0,
                });
        const subLabels: string[] = (group as any).subLabels ?? [
          'Open',
          'Close',
        ];
        return (
          <Fragment key={`${prefix}-${group.segment}-${key}`}>
            {subLabels.map((sub, subIndex) => {
              const val = getDetailCellValue(
                base as SegCount & { update?: number },
                sub,
              );
              const color =
                sub.trim().toUpperCase() === 'OPEN' ||
                sub.trim().toUpperCase() === 'OPN'
                  ? 'text-red-600'
                  : sub.trim().toUpperCase() === 'CLOSE' ||
                      sub.trim().toUpperCase() === 'CLS'
                    ? 'text-emerald-600'
                    : 'text-amber-600';
              return (
                <td
                  key={sub}
                  className={clsx(
                    'px-1.5 py-1.5 text-center font-mono text-[10px] whitespace-nowrap',
                    (keyIndex > 0 || groupIndex > 0) &&
                      subIndex === 0 &&
                      'border-l border-(--border)/60 pl-2',
                    bold && 'font-bold',
                    color,
                  )}
                >
                  {formatCell(val)}
                </td>
              );
            })}
          </Fragment>
        );
      }),
    );
  }

  function renderBucketCells(
    bktList: { key: BucketKey }[],
    getValue: (key: BucketKey) => SegCount,
    prefix: string,
    bold = false,
  ) {
    return bktList.map((bkt) => {
      const data = getValue(bkt.key);
      return (
        <Fragment key={`${prefix}-${bkt.key}`}>
          <td
            className={clsx(
              'px-1.5 py-1.5 text-center font-mono text-[10px] whitespace-nowrap',
              bold && 'font-bold',
              'text-rose-600 dark:text-rose-300',
            )}
          >
            {formatCell(data.open)}
          </td>
          <td
            className={clsx(
              'px-1.5 py-1.5 text-center font-mono text-[10px] whitespace-nowrap',
              bold && 'font-bold',
              'text-emerald-600 dark:text-emerald-300',
            )}
          >
            {formatCell(data.close)}
          </td>
        </Fragment>
      );
    });
  }

  function renderDetailHeaderRows() {
    if (!detailColumns) return null;
    return detailColumns.groups.map((group, groupIndex) => {
      const style =
        DETAIL_GROUP_STYLE[group.segment] ?? DETAIL_GROUP_STYLE.b2c;
      const subLabels: string[] = (group as any).subLabels ?? [
        'Open',
        'Close',
      ];
      return (
        <Fragment key={`detail-header-${group.label}`}>
          {group.keys.map((key, keyIndex) => (
            <th
              key={`${group.segment}-${key}`}
              className={clsx(
                'px-2 py-2 text-center text-[10px] font-semibold tracking-[0.2em] whitespace-nowrap uppercase',
                style.band,
                (groupIndex > 0 || keyIndex > 0) && 'border-l border-(--border)/60',
              )}
              colSpan={subLabels.length}
            >
              {key.replace(/-/g, ' ')}
            </th>
          ))}
        </Fragment>
      );
    });
  }

  function renderDetailSubHeaderRows() {
    if (!detailColumns) return null;
    return detailColumns.groups.flatMap((group, groupIndex) => {
      const style =
        DETAIL_GROUP_STYLE[group.segment] ?? DETAIL_GROUP_STYLE.b2c;
      const subLabels: string[] = (group as any).subLabels ?? [
        'Open',
        'Close',
      ];
      return group.keys.flatMap((key, keyIndex) =>
        subLabels.map((sub, subIndex) => (
          <th
            key={`${group.segment}-${key}-${sub}`}
            className={clsx(
              'px-2 py-2 text-center text-[10px] font-semibold whitespace-nowrap uppercase',
              style.subBand,
              style.text,
              (groupIndex > 0 || keyIndex > 0) &&
                subIndex === 0 &&
                'border-l border-(--border)/60',
            )}
          >
            {sub}
          </th>
        )),
      );
    });
  }

  const detailColCount = detailColumns
    ? detailColumns.totalCols
    : BUCKETS.length * 2;
  const tableMinWidth = detailColumns
    ? Math.max(
        isCustomerMode ? 1120 : 1040,
        420 + detailColCount * (isCustomerMode ? 48 : 44),
      )
    : 920;
  const baseColumnWidths = tableCompact
    ? [182, 64, 64, 64, 60, 68, 60]
    : [260, 86, 86, 86, 86, 92, 86];
  const detailColumnWidth = detailColumns ? (isCustomerMode ? 48 : 44) : 84;
  const headerRowSpan = isDetail && detailColumns ? 3 : 2;
  const detailGroups = detailColumns?.groups ?? [];
  const captureChoices: { label: string; format: CaptureFormat }[] = [
    { label: 'PNG', format: 'png' },
    { label: 'JPEG', format: 'jpeg' },
    { label: 'JPG', format: 'jpg' },
  ];
  const summaryHeaderClass =
    'px-2 py-2 text-center text-[10px] font-bold tracking-[0.16em] text-(--text-secondary) uppercase leading-tight';
  const summaryCellClass =
    'px-2 py-2 text-center font-mono text-[11px] whitespace-nowrap';
  const areaHeaderClass =
    'sticky left-0 z-30 w-48 bg-(--surface-2)/95 px-4 py-2.5 text-left text-[10px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase backdrop-blur shadow-[10px_0_24px_-20px_rgba(15,23,42,0.45)]';
  const areaCellClass =
    'sticky left-0 z-10 bg-(--surface-2)/95 px-4 py-2.5 backdrop-blur shadow-[10px_0_24px_-20px_rgba(15,23,42,0.38)]';
  const workzoneCellClass =
    'bg-(--surface-2)/40 py-2 pr-2.5 pl-24';
  const workzoneLabelClass =
    'max-w-28 truncate text-[10px] font-semibold tracking-[0.04em] text-(--text-muted)';
  const workzoneValueClass =
    'px-1.5 py-1.5 text-center font-mono text-[10px] whitespace-nowrap text-(--text-secondary)';
  const bucketGroupBaseClass =
    'rounded-none px-1.5 py-2 text-center text-[9px] font-semibold tracking-[0.16em] uppercase leading-tight';
  const bucketBoundaryClass = 'border-l border-(--border)/70';
  const totalValueClass = 'text-[12px] font-semibold text-(--text-primary)';
  const loadValueClass =
    'inline-flex min-w-11 justify-center rounded-full border border-(--border) bg-(--bg) px-1.5 py-0.5 font-mono text-[10px] font-bold';

  function aggregateAreaDetail(areaRows: SARow[]): DetailGroup {
    const acc: DetailGroup = { b2c: {}, b2b: {} };
    for (const row of areaRows) {
      for (const seg of ['b2c', 'b2b'] as const) {
        for (const [k, v] of Object.entries(row.detail[seg])) {
          if (!acc[seg][k]) acc[seg][k] = { open: 0, close: 0 };
          acc[seg][k].open += v.open;
          acc[seg][k].close += v.close;
        }
      }
    }
    return acc;
  }

  function aggregateTotalDetail(): DetailGroup {
    const acc: DetailGroup = { b2c: {}, b2b: {} };
    for (const row of rows) {
      for (const seg of ['b2c', 'b2b'] as const) {
        for (const [k, v] of Object.entries(row.detail[seg])) {
          if (!acc[seg][k]) acc[seg][k] = { open: 0, close: 0 };
          acc[seg][k].open += v.open;
          acc[seg][k].close += v.close;
        }
      }
    }
    return acc;
  }

  function aggregateAreaSqm(areaRows: SARow[]) {
    const acc = { open: 0, close: 0, update: 0 };
    for (const row of areaRows) {
      acc.open += row.sqm.open;
      acc.close += row.sqm.close;
      acc.update += row.sqm.update;
    }
    return acc;
  }

  function aggregateTotalSqm() {
    const acc = { open: 0, close: 0, update: 0 };
    for (const row of rows) {
      acc.open += row.sqm.open;
      acc.close += row.sqm.close;
      acc.update += row.sqm.update;
    }
    return acc;
  }

  function aggregateAreaBuckets(areaRows: SARow[]): BucketRecord {
    const acc: BucketRecord = {
      kpiCustomer: { open: 0, close: 0 },
      kpiProactive: { open: 0, close: 0 },
      nonKpiUnspec: { open: 0, close: 0 },
      nonTechnical: { open: 0, close: 0 },
      sqmUpdate: { open: 0, close: 0 },
      obsolete: { open: 0, close: 0 },
    };
    for (const row of areaRows) {
      for (const bkt of BUCKETS) {
        acc[bkt.key].open += row.buckets[bkt.key].open;
        acc[bkt.key].close += row.buckets[bkt.key].close;
      }
    }
    return acc;
  }

  function aggregateTotalBuckets(): BucketRecord {
    const acc: BucketRecord = {
      kpiCustomer: { open: 0, close: 0 },
      kpiProactive: { open: 0, close: 0 },
      nonKpiUnspec: { open: 0, close: 0 },
      nonTechnical: { open: 0, close: 0 },
      sqmUpdate: { open: 0, close: 0 },
      obsolete: { open: 0, close: 0 },
    };
    for (const row of rows) {
      for (const bkt of BUCKETS) {
        acc[bkt.key].open += row.buckets[bkt.key].open;
        acc[bkt.key].close += row.buckets[bkt.key].close;
      }
    }
    return acc;
  }

  return (
    <div className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
      <div className='border-b border-(--border) bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.82))] px-4 py-3 sm:px-5 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(15,23,42,0.28))]'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <p className='text-[10px] font-bold tracking-[0.24em] text-(--text-muted) uppercase'>
              Area matrix
            </p>
            <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
              {modeLabel}
            </p>
            {isCustomerMode && (
              <p className='mt-1 text-[11px] text-(--text-muted)'>
                B2C: DIAMOND / PLATINUM / GOLD / REGULER · B2B: DATIN /
                NON-DATIN / TSEL · SQM: OPN / CLS / UPD
              </p>
            )}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[11px] font-semibold text-(--text-secondary)'>
              Hierarchy
            </span>
            <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[11px] font-semibold text-(--text-secondary)'>
              Open vs Close
            </span>
            <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[11px] font-semibold text-(--text-secondary)'>
              {totals.grand.toLocaleString('id-ID')} WO
            </span>
            {onCapture && (
              <div data-capture-exclude='true'>
                <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-8 rounded-full border-(--border) bg-(--surface) px-3 text-[11px] font-semibold text-(--text-secondary) hover:bg-(--surface-2)'
                    disabled={isCapturing}
                  >
                    <Download className='h-3.5 w-3.5' />
                    {isCapturing ? 'Menyimpan' : 'Capture'}
                    <FileDown className='h-3 w-3 opacity-70' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align='end' className='w-36 p-2'>
                  <div className='space-y-1'>
                    {captureChoices.map((choice) => (
                      <button
                        key={choice.format}
                        type='button'
                        onClick={() => onCapture(choice.format)}
                        className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-(--text-primary) hover:bg-(--surface-2)'
                      >
                        <span>{choice.label}</span>
                        <span className='text-[10px] font-medium text-(--text-muted)'>
                          full HD
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className='w-full overflow-x-auto'>
        <table
          ref={captureTargetRef}
          data-rekap-capture-root='true'
          className='mx-auto w-max min-w-full table-auto border-collapse text-xs'
          style={{ minWidth: `${tableMinWidth}px` }}
        >
          <colgroup>
            {baseColumnWidths.map((width, index) => (
              <col key={`base-${index}`} style={{ width }} />
            ))}
            {isDetail && detailColumns
              ? detailColumns.groups.flatMap((group) =>
                  group.keys.flatMap((key) => {
                    const subLabels: string[] = (group as any).subLabels ?? [
                      'Open',
                      'Close',
                    ];
                    return subLabels.map((sub) => (
                      <col
                        key={`detail-${group.segment}-${key}-${sub}`}
                        style={{ width: detailColumnWidth }}
                      />
                    ));
                  }),
                )
              : BUCKETS.flatMap((bkt) => [
                  <col key={`bucket-${bkt.key}-open`} style={{ width: 84 }} />,
                  <col key={`bucket-${bkt.key}-close`} style={{ width: 84 }} />,
                ])}
          </colgroup>
          <thead>
            <tr className='border-b border-(--border) bg-(--surface-2)/80 text-(--text-primary)'>
              <th
                className={areaHeaderClass}
                rowSpan={headerRowSpan}
              >
                Service Area
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Open
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Close
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Total
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Tek
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Load
              </th>
              <th
                className={summaryHeaderClass}
                rowSpan={headerRowSpan}
              >
                Close %
              </th>
              {isDetail && detailColumns
                ? detailGroups.map((group, groupIndex) => {
                    const subLen = (group as any).subLabels?.length ?? 2;
                    const style =
                      DETAIL_GROUP_STYLE[group.segment] ??
                      DETAIL_GROUP_STYLE.b2c;
                    return (
                      <th
                        key={group.label}
                        className={`border-b border-(--border)/70 ${bucketGroupBaseClass} ${style.band} ${
                          groupIndex > 0 ? bucketBoundaryClass : ''
                        }`}
                        colSpan={group.keys.length * subLen}
                      >
                        <span className='inline-flex items-center justify-center rounded-full border border-white/35 bg-white/20 px-2 py-0.5 shadow-sm dark:border-white/10 dark:bg-white/5'>
                          {group.label}
                        </span>
                      </th>
                    );
                  })
                : BUCKETS.map((bkt, groupIndex) => (
                    <th
                      key={bkt.key}
                      className={`px-1.5 py-1.5 text-center text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap uppercase leading-tight ${
                        groupIndex > 0 ? bucketBoundaryClass : ''
                      }`}
                      colSpan={2}
                    >
                      {bkt.label}
                    </th>
                  ))}
            </tr>
            <tr className='border-b border-(--border) bg-(--surface-2)/80 text-(--text-muted)'>
              {isDetail && detailColumns
                ? renderDetailHeaderRows()
                : BUCKETS.flatMap((bkt, groupIndex) => [
                    <th
                      key={`${bkt.key}-open`}
                      className={`px-1.5 py-1.5 text-center text-[9px] font-semibold whitespace-nowrap text-(--text-secondary) ${
                        groupIndex > 0 ? 'border-l border-(--border)/60' : ''
                      }`}
                    >
                      Open
                    </th>,
                    <th
                      key={`${bkt.key}-close`}
                      className='px-1.5 py-1.5 text-center text-[9px] font-semibold whitespace-nowrap text-(--text-secondary)'
                    >
                      Close
                    </th>,
                  ])}
            </tr>
            {isDetail && detailColumns && (
              <tr className='border-b border-(--border) bg-(--surface-2)/75 text-(--text-muted)'>
                {renderDetailSubHeaderRows()}
              </tr>
            )}
          </thead>

          <tbody>
            {Array.from(areaGroups.entries()).map(([area, areaRows]) => {
              const isOpen = openAreas.has(area);
              const areaOpen = areaRows.reduce(
                (sum, row) =>
                  sum +
                  getDisplayedOpen(row.totalOpen, row.totalClose, row.grandTotal),
                0,
              );
              const areaClose = areaRows.reduce(
                (sum, row) =>
                  sum +
                  getDisplayedClose(row.totalOpen, row.totalClose, row.grandTotal),
                0,
              );

              return (
                <Fragment key={area}>
                  <tr
                    className='cursor-pointer border-y border-(--border) bg-(--surface-2)/75 transition-colors select-none hover:bg-(--surface-2)/90'
                    onClick={() => toggleArea(area)}
                  >
                    <td className={areaCellClass}>
                      <div className='flex items-center justify-between gap-1.5'>
                        <span className='text-[11px] font-semibold tracking-[0.16em] text-(--text-primary) uppercase'>
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
                    <td className={clsx(summaryCellClass, 'font-semibold text-rose-600 dark:text-rose-300')}>
                      {areaOpen}
                    </td>
                    <td className={clsx(summaryCellClass, 'font-semibold text-emerald-600 dark:text-emerald-300')}>
                      {areaClose}
                    </td>
                    <td className={clsx(summaryCellClass, totalValueClass)}>
                      {areaOpen + areaClose}
                    </td>
                    <td className={clsx(summaryCellClass, 'text-(--text-secondary)')}>
                      {areaRows.reduce((sum, r) => sum + r.teknisiMasuk, 0)}
                    </td>
                    <td className='px-1.5 py-2 text-center whitespace-nowrap'>
                      {(() => {
                        const tek = areaRows.reduce(
                          (sum, r) => sum + r.teknisiMasuk,
                          0,
                        );
                        const load =
                          tek > 0 ? (areaOpen / tek).toFixed(1) : '0.0';
                        return (
                          <span
                            className={clsx(loadValueClass)}
                            style={loadToneStyle(areaOpen, tek)}
                          >
                            {load}
                          </span>
                        );
                      })()}
                    </td>
                    <td className={clsx(summaryCellClass, 'text-[10px] font-semibold text-(--text-secondary)')}>
                      {areaOpen + areaClose > 0
                        ? Math.round((areaClose / (areaOpen + areaClose)) * 100)
                        : 0}
                      %
                    </td>
                    {isDetail && detailColumns
                      ? renderDetailCells(
                          {
                            detail: aggregateAreaDetail(areaRows),
                            sqm: aggregateAreaSqm(areaRows),
                            buckets: isObsoleteMode
                              ? aggregateAreaBuckets(areaRows)
                              : undefined,
                          },
                          `area-${area}`,
                          true,
                        )
                      : renderBucketCells(
                          BUCKETS,
                          (key) =>
                            areaRows.reduce(
                              (acc, row) => ({
                                open: acc.open + row.buckets[key].open,
                                close: acc.close + row.buckets[key].close,
                              }),
                              { open: 0, close: 0 },
                            ),
                          `area-${area}`,
                          true,
                        )}
                  </tr>

                  {isOpen &&
                    areaRows.map((row) => {
                      const displayOpen = getDisplayedOpen(
                        row.totalOpen,
                        row.totalClose,
                        row.grandTotal,
                      );
                      const displayClose = getDisplayedClose(
                        row.totalOpen,
                        row.totalClose,
                        row.grandTotal,
                      );
                      const closeRate =
                        row.grandTotal > 0
                          ? Math.round((displayClose / row.grandTotal) * 100)
                          : 0;

                      return (
                        <Fragment key={row.saName}>
                          <tr className='border-b border-(--border) bg-(--surface) hover:bg-(--surface-2)'>
                            <td className='sticky left-0 z-10 bg-(--surface) py-2 pr-3 pl-8 shadow-[10px_0_24px_-20px_rgba(15,23,42,0.28)]'>
                              <div className='flex min-w-0 items-center gap-2 border-l-2 border-dashed border-blue-500/15 pl-4'>
                                <span className='shrink-0 text-[11px] font-semibold tracking-[0.12em] text-blue-500/65'>
                                  ↳
                                </span>
                                <p
                                  className='truncate text-[13px] font-semibold text-(--text-primary)'
                                  title={row.saName}
                                >
                                  {row.saName}
                                </p>
                              </div>
                            </td>
                            <td className={clsx(summaryCellClass, 'font-semibold text-rose-600 dark:text-rose-300')}>
                              {displayOpen}
                            </td>
                            <td className={clsx(summaryCellClass, 'font-semibold text-emerald-600 dark:text-emerald-300')}>
                              {displayClose}
                            </td>
                            <td className={clsx(summaryCellClass, totalValueClass)}>
                              {row.grandTotal}
                            </td>
                            <td className={clsx(summaryCellClass, 'text-(--text-secondary)')}>
                              {row.teknisiMasuk}
                            </td>
                            <td className='px-1.5 py-2 text-center whitespace-nowrap'>
                              <span
                                className={clsx(loadValueClass)}
                                style={loadToneStyle(displayOpen, row.teknisiMasuk)}
                              >
                                {row.teknisiMasuk > 0
                                  ? (displayOpen / row.teknisiMasuk).toFixed(1)
                                  : '—'}
                              </span>
                            </td>
                            <td className={clsx(summaryCellClass, 'text-[10px] font-semibold text-(--text-secondary)')}>
                              {closeRate}%
                            </td>
                            {isDetail && detailColumns
                              ? renderDetailCells(
                                  isObsoleteMode
                                    ? { ...row, buckets: row.buckets }
                            : row,
                                  row.saName,
                                )
                            : renderBucketCells(
                                  BUCKETS,
                                  (key) => row.buckets[key],
                                  row.saName,
                                )}
                          </tr>

                          {!(row.workzones.length === 1 &&
                            isSameLabel(row.workzones[0].workzone, row.saName)) &&
                            row.workzones.map((wz) => (
                              <tr
                                key={`${row.saName}-${wz.workzone}`}
                                className='border-b border-(--border)/60 bg-(--surface-2)/35'
                              >
                            <td className={workzoneCellClass}>
                                <div className='flex items-center gap-2'>
                                  <span className='shrink-0 text-[11px] font-semibold tracking-[0.12em] text-blue-500/70'>
                                    ↳
                                  </span>
                                  <div className='min-w-0'>
                                    <span className={workzoneLabelClass}>
                                      {wz.workzone}
                                    </span>
                                    <div className='mt-1 h-1.5 w-12 overflow-hidden rounded-full bg-(--surface-3)'>
                                      <div
                                        className='h-full rounded-full bg-blue-500'
                                        style={{
                                          width: `${Math.min((getDisplayedOpen(wz.totalOpen, wz.totalClose, wz.totalAll) / Math.max(maxWorkzoneOpen, 1)) * 100, 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className={clsx(workzoneValueClass, 'text-rose-500')}>
                                {formatCell(
                                  getDisplayedOpen(
                                    wz.totalOpen,
                                    wz.totalClose,
                                    wz.totalAll,
                                  ),
                                )}
                              </td>
                              <td className={clsx(workzoneValueClass, 'text-emerald-500')}>
                                {formatCell(
                                  getDisplayedClose(
                                    wz.totalOpen,
                                    wz.totalClose,
                                    wz.totalAll,
                                  ),
                                )}
                              </td>
                              <td colSpan={4 + detailColCount} />
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
            <tr className='border-t-2 border-(--border) bg-(--surface-2) font-bold text-(--text-primary)'>
              <td className={clsx(areaHeaderClass, 'z-20 text-right')}>
                Total
              </td>
              <td className={clsx(summaryCellClass, 'font-bold text-rose-500')}>
                {totals.open}
              </td>
              <td className={clsx(summaryCellClass, 'font-bold text-emerald-500')}>
                {displayedTotalClose}
              </td>
              <td className={clsx(summaryCellClass, 'font-bold text-(--text-primary)')}>
                {totals.grand}
              </td>
              <td className={clsx(summaryCellClass, 'font-bold text-(--text-primary)')}>
                {totals.teknisi}
              </td>
              <td className={clsx(summaryCellClass, 'font-bold text-(--text-primary)')}>
                {totals.teknisi > 0
                  ? (totals.open / totals.teknisi).toFixed(1)
                  : '0.0'}
              </td>
              <td className={clsx(summaryCellClass, 'text-[10px] font-bold text-(--text-secondary)')}>
                {totals.grand > 0
                  ? Math.round((displayedTotalClose / totals.grand) * 100)
                  : 0}
                %
              </td>
              {isDetail && detailColumns
                ? renderDetailCells(
                    {
                      detail: aggregateTotalDetail(),
                      sqm: aggregateTotalSqm(),
                      buckets: isObsoleteMode
                        ? aggregateTotalBuckets()
                        : undefined,
                    },
                    'total',
                    true,
                  )
                : renderBucketCells(
                    BUCKETS,
                    (key) => totals.buckets.get(key)!,
                    'total',
                    true,
                  )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
