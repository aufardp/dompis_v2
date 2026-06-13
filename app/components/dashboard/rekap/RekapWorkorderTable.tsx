import { Fragment, useState, useCallback, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

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
  overviewSummary?: {
    total: number;
    open: number;
    assigned: number;
    close: number;
  };
}

export default function RekapWorkorderTable({
  rows,
  detailMode,
  overviewSummary,
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
  const isJenis2Mode =
    detailMode === 'kpi_proactive' || detailMode === 'sqm_update';
  const isUnspecMode = detailMode === 'non_kpi_unspec';
  const isCustomerMode = detailMode === 'kpi_customer';

  const detailColumns = useMemo(() => {
    if (!isDetail) return null;
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
  }, [isDetail, isJenis2Mode, isUnspecMode, isCustomerMode, rows]);

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
    open: overviewSummary
      ? overviewSummary.open + overviewSummary.assigned
      : rows.reduce((sum, row) => sum + row.totalOpen, 0),
    close: overviewSummary
      ? overviewSummary.close
      : rows.reduce((sum, row) => sum + row.totalClose, 0),
    grand: overviewSummary
      ? overviewSummary.total
      : rows.reduce((sum, row) => sum + row.totalOpen + row.totalClose, 0),
    teknisi: rows.reduce((sum, row) => sum + row.teknisiMasuk, 0),
    buckets: new Map<BucketKey, SegCount>(),
  };

  for (const bkt of BUCKETS) {
    totals.buckets.set(bkt.key, { open: 0, close: 0 });
  }
  for (const row of rows) {
    for (const bkt of BUCKETS) {
      const data = row.buckets[bkt.key];
      const total = totals.buckets.get(bkt.key)!;
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

  function renderDetailCells(
    row: {
      detail: DetailGroup;
      sqm?: { open: number; close: number; update: number };
    },
    prefix: string,
    bold = false,
  ) {
    if (!detailColumns) return null;
    return detailColumns.groups.flatMap((group) =>
      group.keys.map((key) => {
        const base =
          group.segment === 'sqm'
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
            {subLabels.map((sub) => {
              const val = getDetailCellValue(base as SegCount & { update?: number }, sub);
              const color =
                sub.trim().toUpperCase() === 'OPEN' || sub.trim().toUpperCase() === 'OPN'
                  ? 'text-red-600'
                  : sub.trim().toUpperCase() === 'CLOSE' || sub.trim().toUpperCase() === 'CLS'
                    ? 'text-emerald-600'
                    : 'text-amber-600';
              return (
                <td
                  key={sub}
                  className={clsx(
                    'px-2 py-2 text-center font-mono',
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
              'px-2 py-2 text-center font-mono',
              bold && 'font-bold',
              'text-red-600',
            )}
          >
            {formatCell(data.open)}
          </td>
          <td
            className={clsx(
              'px-2 py-2 text-center font-mono',
              bold && 'font-bold',
              'text-emerald-600',
            )}
          >
            {formatCell(data.close)}
          </td>
        </Fragment>
      );
    });
  }

  const detailColCount = detailColumns
    ? detailColumns.totalCols
    : BUCKETS.length * 2;

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

  return (
    <div className='rounded-lg border border-(--border)'>
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
              {isDetail && detailColumns ? (
                detailColumns.groups.map((group) => {
                  const subLen = (group as any).subLabels?.length ?? 2;
                  const color =
                    group.segment === 'b2c'
                      ? 'bg-blue-600'
                      : group.segment === 'sqm'
                        ? 'bg-violet-600'
                        : 'bg-cyan-600';
                  return (
                    <th
                      key={group.label}
                      className={`px-2 py-2 text-center text-[11px] font-black tracking-wider text-white uppercase ${color}`}
                      colSpan={group.keys.length * subLen}
                    >
                      {group.label}
                    </th>
                  );
                })
              ) : (
                <th
                  className='bg-slate-700 px-2 py-2 text-center text-[11px] font-black tracking-wider text-white uppercase'
                  colSpan={12}
                >
                  OPERATIONAL BUCKETS
                </th>
              )}
            </tr>
            <tr className='border-b border-(--border) bg-(--surface-2) text-(--text-secondary)'>
              {isDetail && detailColumns
                ? detailColumns.groups.flatMap((group) =>
                    group.keys.map((key) => {
                      const label =
                        !isJenis2Mode &&
                        !isUnspecMode &&
                        group.segment === 'b2c' &&
                        B2C_DETAIL_LABEL[key]
                          ? B2C_DETAIL_LABEL[key]
                          : key.toUpperCase();
                      const subLen = (group as any).subLabels?.length ?? 2;
                      return (
                        <th
                          key={`${group.segment}-${key}`}
                          className='px-2 py-2 text-center text-[10px] font-semibold'
                          colSpan={subLen}
                        >
                          {label}
                        </th>
                      );
                    }),
                  )
                : BUCKETS.map((bkt) => (
                    <th
                      key={bkt.key}
                      className='px-2 py-2 text-center text-[10px] font-semibold'
                      colSpan={2}
                    >
                      {bkt.label}
                    </th>
                  ))}
            </tr>
            <tr className='border-b border-(--border) bg-(--surface-2) text-(--text-muted)'>
              <th className='sticky left-0 z-20 bg-(--surface-2) px-3 py-2 text-left'>
                Area / SA
              </th>
              <th colSpan={6} />
              {isDetail && detailColumns
                ? detailColumns.groups.flatMap((group) => {
                    const subLabels: string[] = (group as any).subLabels ?? [
                      'Open',
                      'Close',
                    ];
                    return subLabels.map((sub) => (
                      <th
                        key={`${group.label}-${sub}`}
                        className='px-2 py-2 text-center text-[10px] font-semibold'
                      >
                        {sub}
                      </th>
                    ));
                  })
                : Array.from({ length: BUCKETS.length * 2 }).map((_, i) => (
                    <th key={i} className='px-2 py-2 text-center font-semibold'>
                      {i % 2 === 0 ? 'Open' : 'Close'}
                    </th>
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
                    className='cursor-pointer border-y border-(--border) bg-(--surface-2) select-none'
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
                    <td className='px-2 py-2 text-center font-bold text-red-600'>
                      {areaOpen}
                    </td>
                    <td className='px-2 py-2 text-center font-bold text-emerald-600'>
                      {areaClose}
                    </td>
                    <td className='px-2 py-2 text-center font-bold text-(--text-primary)'>
                      {areaOpen + areaClose}
                    </td>
                    <td className='px-2 py-2 text-center font-mono text-(--text-secondary)'>
                      {areaRows.reduce((sum, r) => sum + r.teknisiMasuk, 0)}
                    </td>
                    <td className='px-2 py-2 text-center'>
                      {(() => {
                        const tek = areaRows.reduce(
                          (sum, r) => sum + r.teknisiMasuk,
                          0,
                        );
                        const load =
                          tek > 0 ? (areaOpen / tek).toFixed(1) : '0.0';
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
                        : 0}
                      %
                    </td>
                    {isDetail && detailColumns
                      ? renderDetailCells(
                          {
                            detail: aggregateAreaDetail(areaRows),
                            sqm: aggregateAreaSqm(areaRows),
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
                      const closeRate =
                        row.grandTotal > 0
                          ? Math.round((row.totalClose / row.grandTotal) * 100)
                          : 0;

                      return (
                        <Fragment key={row.saName}>
                          <tr className='border-b border-(--border) bg-(--surface) hover:bg-(--surface-2)'>
                            <td className='sticky left-0 z-10 bg-(--surface) px-3 py-2.5'>
                              <div className='min-w-0'>
                                <p
                                  className='truncate font-bold text-(--text-primary)'
                                  title={row.saName}
                                >
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
                                className='inline-flex min-w-14 justify-center rounded px-2 py-1 font-mono font-bold'
                                style={loadToneStyle(
                                  row.totalOpen,
                                  row.teknisiMasuk,
                                )}
                              >
                                {row.woPerTeknisi}
                              </span>
                            </td>
                            <td className='px-2 py-2.5 text-center text-[11px] font-semibold text-(--text-secondary)'>
                              {closeRate}%
                            </td>
                            {isDetail && detailColumns
                              ? renderDetailCells(row, row.saName)
                              : renderBucketCells(
                                  BUCKETS,
                                  (key) => row.buckets[key],
                                  row.saName,
                                )}
                          </tr>

                          {row.workzones.map((wz) => (
                            <tr
                              key={`${row.saName}-${wz.workzone}`}
                              className='border-b border-(--border) bg-(--surface-2)/50'
                            >
                              <td className='sticky left-0 bg-(--surface-2) py-1.5 pr-3 pl-8'>
                                <div className='flex items-center gap-2'>
                                  <div className='h-1 w-16 overflow-hidden rounded-full bg-(--surface-3)'>
                                    <div
                                      className='h-full rounded-full bg-blue-500'
                                      style={{
                                        width: `${Math.min((wz.totalOpen / Math.max(maxWorkzoneOpen, 1)) * 100, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className='max-w-30 truncate text-[11px] text-(--text-secondary)'>
                                    {wz.workzone}
                                  </span>
                                </div>
                              </td>
                              <td className='px-2 py-1.5 text-center font-mono text-[11px] text-red-500'>
                                {formatCell(wz.totalOpen)}
                              </td>
                              <td className='px-2 py-1.5 text-center font-mono text-[11px] text-emerald-500'>
                                {formatCell(wz.totalClose)}
                              </td>
                              <td colSpan={5 + detailColCount} />
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
              <td className='sticky left-0 z-20 bg-(--surface-2) px-3 py-3 text-right tracking-wide uppercase'>
                Total
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold text-red-500'>
                {totals.open}
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold text-emerald-500'>
                {totals.close}
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold'>
                {totals.grand}
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold'>
                {totals.teknisi}
              </td>
              <td className='px-2 py-3 text-center font-mono font-bold'>
                {totals.teknisi > 0
                  ? (totals.open / totals.teknisi).toFixed(1)
                  : '0.0'}
              </td>
              <td className='px-2 py-3 text-center text-[11px] font-bold'>
                {totals.grand > 0
                  ? Math.round((totals.close / totals.grand) * 100)
                  : 0}
                %
              </td>
              {isDetail && detailColumns
                ? renderDetailCells(
                    {
                      detail: aggregateTotalDetail(),
                      sqm: aggregateTotalSqm(),
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
