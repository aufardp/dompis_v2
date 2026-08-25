'use client';

import type { ComponentType, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { queryKeys } from '@/app/libs/query-keys';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
} from 'lucide-react';
import DataFreshnessBadge from '../DataFreshnessBadge';
import RekapSkeleton from './RekapSkeleton';
import type { CaptureFormat } from './captureElementAsImage';
import { captureElementAsImage } from './captureElementAsImage';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import BranchFilterSelect from '@/app/components/ui/BranchFilterSelect';
import RekapTicketMembersModal from './RekapTicketMembersModal';
import type { RekapCellSpec } from './cellSpec';

const RekapWorkorderHourlyClose = dynamic(
  () => import('./RekapWorkorderHourlyClose'),
  {
    ssr: false,
    loading: () => (
      <div className='h-60 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
    ),
  },
) as ComponentType<{ bucket?: string; branch?: string }>;

const RekapTrendMiniChart = dynamic(
  () => import('./RekapTrendMiniChart'),
  {
    ssr: false,
    loading: () => <div className='h-24 animate-pulse rounded-2xl bg-(--surface-2)' />,
  },
) as ComponentType<{ bucket?: string; branch?: string }>;

const RekapWorkorderTable = dynamic(() => import('./RekapWorkorderTable'), {
  ssr: false,
  loading: () => (
    <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
  ),
});

const RekapWorkorderCards = dynamic(() => import('./RekapWorkorderCards'), {
  ssr: false,
  loading: () => (
    <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
  ),
});

interface SegCount {
  open: number;
  close: number;
}

interface StatusCounts {
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
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
  status: StatusCounts;
  segmentTotal?: SegmentTotal;
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  teknisiTerdaftar: number;
  teknisiCoverage: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  status: StatusCounts;
  workzones: WorkzoneRow[];
  segmentTotal?: SegmentTotal;
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface KpiSummaryCounts {
  total: number;
  kpiCustomer: number;
  kpiProactive: number;
  nonKpiUnspec: number;
  nonTechnical: number;
  sqmUpdate: number;
  obsolete: number;
}

interface BucketSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

interface BucketBreakdownCounts {
  kpiCustomer: BucketSummaryCounts;
  kpiProactive: BucketSummaryCounts;
  nonKpiUnspec: BucketSummaryCounts;
  nonTechnical: BucketSummaryCounts;
  sqmUpdate: BucketSummaryCounts;
  obsolete: BucketSummaryCounts;
}

interface WorkboardSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

interface AgingRow {
  saName: string;
  openCount: number;
  oldestAt: string | null;
  g24: number;
  g48: number;
  g72: number;
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  kpiSummary?: KpiSummaryCounts;
  bucketSummary?: BucketSummaryCounts;
  bucketBreakdown?: BucketBreakdownCounts;
  workboardSummary?: WorkboardSummaryCounts;
  aging?: AgingRow[];
  selectedBucket?: string;
  error?: string;
}

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'kpi_customer', label: 'Customer' },
  { value: 'kpi_proactive', label: 'Proactive' },
  { value: 'non_kpi_unspec', label: 'Unspec' },
  { value: 'non_technical', label: 'Non Technical' },
  { value: 'sqm_update', label: 'SQM Update' },
  { value: 'obsolete', label: 'Obsolete' },
] as const;

function BucketFilterBar({
  selectedBucket,
  onChange,
}: {
  selectedBucket: string;
  onChange: (bucket: string) => void;
}) {
  return (
    <div className='inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]'>
      {BUCKET_OPTIONS.map((opt) => {
        const active = opt.value === selectedBucket;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-2.75 py-1.5 text-[11px] font-semibold transition-all ${
              active
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-surface-2 border border-transparent text-(--text-secondary) hover:border-(--border) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MobileBucketFilterGrid({
  selectedBucket,
  onChange,
}: {
  selectedBucket: string;
  onChange: (bucket: string) => void;
}) {
  return (
    <div className='space-y-2'>
      {BUCKET_OPTIONS.map((opt) => {
        const active = opt.value === selectedBucket;
        const isAll = opt.value === 'all';
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 w-full rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold leading-tight transition-all ${
              active
                ? 'border-blue-500/20 bg-blue-500 text-white shadow-sm'
                : 'border-(--border) bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            } ${isAll ? 'py-2.5 text-[12px]' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const toneStyles: Record<
  string,
  { text: string; icon: string; dot: string }
> = {
  slate: {
    text: 'text-(--text-primary)',
    icon: 'text-(--text-muted)',
    dot: 'bg-(--border)',
  },
  red: {
    text: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
    dot: 'bg-red-500',
  },
  green: {
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: 'text-emerald-500',
    dot: 'bg-emerald-500',
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    icon: 'text-blue-500',
    dot: 'bg-blue-500',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
    dot: 'bg-amber-500',
  },
};

const BUCKET_CONTEXT: Record<
  string,
  { label: string; description: string; hint: string }
> = {
  all: {
    label: 'All view',
    description:
      'Menampilkan seluruh bucket operasional dalam satu tabel utama.',
    hint: 'Gunakan untuk membaca distribusi total.',
  },
  kpi_customer: {
    label: 'Customer view',
    description: 'Fokus pada B2C, B2B, dan SQM yang masuk bucket Customer.',
    hint: 'Detail utama: REGULER, GOLD, PLATINUM, DIAMOND.',
  },
  kpi_proactive: {
    label: 'Proactive view',
    description:
      'Fokus pada tiket proactive, termasuk keluarga SQM dan SQM-CCAN.',
    hint: 'Detail utama: SQM dan SQM-CCAN.',
  },
  non_kpi_unspec: {
    label: 'Unspec view',
    description: 'Fokus pada tiket unspec untuk B2C dan B2B.',
    hint: 'Detail utama: UNSPEC dan UNSPEC-B2B.',
  },
  non_technical: {
    label: 'Non Technical view',
    description:
      'Menampilkan ticket non-technical yang relevan untuk review operasional.',
    hint: 'Konteks investigasi dan permintaan.',
  },
  sqm_update: {
    label: 'SQM Update view',
    description: 'Menampilkan tiket yang berstatus SQM Update dan turunannya.',
    hint: 'Sesuai header [SQM-UPDATE].',
  },
  obsolete: {
    label: 'Obsolete view',
    description: 'Menampilkan tiket yang sudah masuk kategori obsolete.',
    hint: 'classification_path Z_PERMINTAAN_044.',
  },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function computeCloseRate(open: number, close: number): number {
  const total = open + close;
  return total > 0 ? Math.round((close / total) * 100) : 0;
}

function computeSummary(rows: SARow[]) {
  const open = rows.reduce((sum, row) => sum + row.totalOpen, 0);
  const close = rows.reduce((sum, row) => sum + row.totalClose, 0);
  const total = open + close;
  const openB2b = rows.reduce((sum, row) => sum + (row.segmentTotal?.b2b.open ?? 0), 0);
  const openB2c = rows.reduce((sum, row) => sum + (row.segmentTotal?.b2c.open ?? 0), 0);
  const closeB2b = rows.reduce((sum, row) => sum + (row.segmentTotal?.b2b.close ?? 0), 0);
  const closeB2c = rows.reduce((sum, row) => sum + (row.segmentTotal?.b2c.close ?? 0), 0);
  const teknisi = rows.reduce((sum, row) => sum + row.teknisiMasuk, 0);
  const registered = rows.reduce(
    (sum, row) => sum + (row.teknisiTerdaftar ?? 0),
    0,
  );
  const closeRate = computeCloseRate(open, close);
  const woPerTeknisi = teknisi > 0 ? (open / teknisi).toFixed(1) : '0.0';

  let coverage = 0;
  if (registered > 0) {
    const withReg = rows.filter((r) => (r.teknisiTerdaftar ?? 0) > 0);
    if (withReg.length > 0) {
      const totalMasuk = withReg.reduce((s, r) => s + r.teknisiMasuk, 0);
      const totalReg = withReg.reduce(
        (s, r) => s + (r.teknisiTerdaftar ?? 0),
        0,
      );
      coverage = totalReg > 0 ? Math.round((totalMasuk / totalReg) * 100) : 0;
    }
  }

  return {
    open,
    close,
    total,
    teknisi,
    registered,
    coverage,
    closeRate,
    woPerTeknisi,
    openB2b,
    openB2c,
    closeB2b,
    closeB2c,
  };
}

function computeStatusFlow(
  summary?: BucketSummaryCounts | WorkboardSummaryCounts,
) {
  if (!summary) return null;
  const total = summary.total;
  const needAction = Math.max(
    0,
    summary.open - (summary.assigned ?? 0) - (summary.onProgress ?? 0) - (summary.pending ?? 0),
  );
  return [
    { label: 'Need action', value: needAction, color: '#ef4444' },
    { label: 'Assigned', value: summary.assigned ?? 0, color: '#3b82f6' },
    { label: 'On progress', value: summary.onProgress ?? 0, color: '#f59e0b' },
    { label: 'Pending', value: summary.pending ?? 0, color: '#8b5cf6' },
    { label: 'Close', value: summary.close ?? 0, color: '#10b981' },
  ].map((seg) => ({ ...seg, pct: total > 0 ? (seg.value / total) * 100 : 0 }));
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
  icon,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'slate' | 'red' | 'green' | 'blue' | 'amber';
  icon: ReactNode;
  children?: ReactNode;
}) {
  const t = toneStyles[tone];

  return (
    <div className='rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-[10px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
          {label}
        </p>
        <div className={t.icon}>{icon}</div>
      </div>
      <div className='mt-2 flex items-end justify-between gap-2'>
        <p className={`text-[1.55rem] leading-none font-semibold tabular-nums ${t.text}`}>
          {value}
        </p>
        {sub && (
          <p className='max-w-24 text-right text-[10px] leading-4 text-(--text-muted)'>
            {sub}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusFlowBar({
  flow,
  showLegend = true,
}: {
  flow: ReturnType<typeof computeStatusFlow>;
  showLegend?: boolean;
}) {
  if (!flow) return null;
  const visible = flow.filter((seg) => seg.value > 0);

  return (
    <div>
      <div className='flex h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)'>
        {visible.map((seg) => (
          <div
            key={seg.label}
            title={`${seg.label}: ${formatNumber(seg.value)}`}
            style={{ width: `${seg.pct}%`, background: seg.color }}
          />
        ))}
      </div>
      {showLegend && visible.length > 0 && (
        <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
          {visible.map((seg) => (
            <span
              key={seg.label}
              className='flex items-center gap-1.5 text-[10px] text-(--text-secondary)'
            >
              <span
                className='h-1.5 w-1.5 rounded-full'
                style={{ background: seg.color }}
              />
              <span className='font-mono font-semibold tabular-nums text-(--text-primary)'>
                {formatNumber(seg.value)}
              </span>
              {seg.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiHealthDot({
  value,
  good,
  moderate,
}: {
  value: number;
  good: string;
  moderate: string;
}) {
  const tone = value >= 6 ? 'bg-red-500' : value >= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = value >= 6 ? 'Overloaded' : value >= 3 ? moderate : good;
  return (
    <div className='mt-1 flex items-center gap-1'>
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      <span className='text-[9px] text-(--text-muted)'>{label}</span>
    </div>
  );
}

function formatAge(value: string | null): string {
  if (!value) return '—';
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return String(value);
  const diffH = Math.floor((Date.now() - t.getTime()) / 3_600_000);
  if (diffH < 1) return 'hari ini';
  if (diffH < 48) return `${diffH} jam lalu`;
  return `${Math.floor(diffH / 24)} hari lalu`;
}

function AttentionList({
  rows,
  aging,
}: {
  rows: SARow[];
  aging?: AgingRow[];
}) {
  if (!rows.length) return null;

  const items: {
    key: string;
    tone: 'red' | 'amber' | 'blue' | 'slate';
    text: string;
    sub: string;
  }[] = [];

  const withTickets = rows.filter((r) => r.totalOpen + r.totalClose > 0);

  const byOpen = [...withTickets].sort((a, b) => b.totalOpen - a.totalOpen);
  const topOpen = byOpen[0];
  if (topOpen && topOpen.totalOpen > 0) {
    items.push({
      key: 'open',
      tone: 'red',
      text: `${topOpen.saName} — open terbanyak`,
      sub: `${formatNumber(topOpen.totalOpen)} tiket perlu diproses`,
    });
  }

  const byCloseRate = [...withTickets].sort(
    (a, b) =>
      computeCloseRate(a.totalOpen, a.totalClose) -
      computeCloseRate(b.totalOpen, b.totalClose),
  );
  const worstRate = byCloseRate[0];
  if (
    worstRate &&
    worstRate.totalOpen > 0 &&
    computeCloseRate(worstRate.totalOpen, worstRate.totalClose) === 0
  ) {
    items.push({
      key: 'rate',
      tone: 'red',
      text: `${worstRate.saName} — belum ada close`,
      sub: `${formatNumber(worstRate.totalOpen)} open masih menggantung`,
    });
  }

  const overloaded = [...withTickets]
    .filter((r) => Number(r.woPerTeknisi) >= 6 && r.teknisiMasuk > 0)
    .sort((a, b) => Number(b.woPerTeknisi) - Number(a.woPerTeknisi));
  const topLoad = overloaded[0];
  if (topLoad) {
    items.push({
      key: 'load',
      tone: 'amber',
      text: `${topLoad.saName} — overloaded`,
      sub: `${topLoad.woPerTeknisi} WO/teknisi, batas sehat < 3`,
    });
  }

  const absent = [...rows]
    .filter((r) => r.teknisiMasuk === 0 && r.totalOpen > 0)
    .sort((a, b) => b.totalOpen - a.totalOpen);
  const topAbsent = absent[0];
  if (topAbsent) {
    const reg =
      topAbsent.teknisiTerdaftar > 0
        ? `${topAbsent.teknisiTerdaftar} terdaftar`
        : 'belum ada daftar';
    items.push({
      key: 'absent',
      tone: 'amber',
      text: `${topAbsent.saName} — teknisi belum absen`,
      sub: `${formatNumber(topAbsent.totalOpen)} open terbuka · ${reg}`,
    });
  }

  const agingByCount = [...(aging ?? [])].sort(
    (a, b) => b.g72 - a.g72,
  );
  const topAged = agingByCount[0];
  if (topAged && topAged.g72 > 0) {
    items.push({
      key: 'aged',
      tone: 'blue',
      text: `${topAged.saName} — banyak open lama`,
      sub: `${formatNumber(topAged.g72)} tiket > 72 jam`,
    });
  }

  if (items.length === 0) {
    return (
      <div>
        <p className='text-[10px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
          Perlu perhatian
        </p>
        <p className='mt-1 text-[11px] leading-4 text-(--text-muted)'>
          Tidak ada anomali terdeteksi hari ini.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
        Perlu perhatian
      </p>
      <ul className='mt-2 space-y-1.5'>
        {items.slice(0, 4).map((item) => (
          <li
            key={item.key}
            className='flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--surface-2)'
          >
            <span
              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                item.tone === 'red'
                  ? 'bg-red-500'
                  : item.tone === 'amber'
                    ? 'bg-amber-500'
                    : item.tone === 'blue'
                      ? 'bg-blue-500'
                      : 'bg-(--border)'
              }`}
            />
            <div className='min-w-0'>
              <p className='truncate text-[11px] font-semibold text-(--text-primary)'>
                {item.text}
              </p>
              <p className='truncate text-[10px] text-(--text-muted)'>
                {item.sub}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgingBlock({ aging }: { aging?: AgingRow[] }) {
  const top = [...(aging ?? [])]
    .sort((a, b) => b.openCount - a.openCount)
    .filter((r) => r.openCount > 0)
    .slice(0, 3);

  if (top.length === 0) {
    return (
      <div>
        <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
          Umur tiket open
        </p>
        <p className='mt-1.5 text-[11px] text-(--text-muted)'>
          Tidak ada tiket open hari ini.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
        Umur tiket open
      </p>
      <ul className='mt-2 space-y-1.5'>
        {top.map((row) => (
          <li
            key={row.saName}
            className='flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--surface-2)'
          >
            <div className='min-w-0'>
              <p className='truncate text-[11px] font-semibold text-(--text-primary)'>
                {row.saName}
              </p>
              <p className='text-[10px] text-(--text-muted)'>
                tertua {formatAge(row.oldestAt)}
              </p>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              {row.g72 > 0 && (
                <span className='rounded-full bg-red-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-red-600 dark:text-red-300'>
                  {formatNumber(row.g72)} &gt;72j
                </span>
              )}
              {row.g48 > 0 && row.g72 === 0 && (
                <span className='rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-600 dark:text-amber-300'>
                  {formatNumber(row.g48)} &gt;48j
                </span>
              )}
              <span className='font-mono text-[11px] font-semibold tabular-nums text-(--text-primary)'>
                {formatNumber(row.openCount)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RekapWorkorderClient({
  initialWorkzone = '',
  initialBranch = '',
}: {
  initialWorkzone?: string;
  initialBranch?: string;
}) {
  const { workzone } = usePersistentWorkzoneScope(initialWorkzone);
  const { branch } = usePersistentBranchScope(initialBranch);
  const [selectedBucket, setSelectedBucket] = useState('all');
  const captureTargetRef = useRef<HTMLTableElement | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [heavySectionsReady, setHeavySectionsReady] = useState({
    hourly: false,
    table: false,
    cards: false,
  });
  const [cellSpec, setCellSpec] = useState<RekapCellSpec | null>(null);

  const queryParams = useMemo(
    () => {
      const params = new URLSearchParams({ bucket: selectedBucket });
      if (workzone) params.set('workzone', workzone);
      if (branch) params.set('branch', branch);
      return params;
    },
    [selectedBucket, workzone, branch],
  );

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<RekapResponse>({
      queryKey: [
        ...queryKeys.dashboard.rekapWorkorder(),
        selectedBucket,
        workzone || 'all',
        branch || 'all',
      ],
      queryFn: async () => {
        const res = await fetch(
          `/api/dashboard/rekap-workorder?${queryParams}`,
          {
            cache: 'no-store',
          },
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch');
        }
        return res.json();
      },
      refetchInterval: 300000,
      staleTime: 120000,
    });

  useEffect(() => {
    if (!data?.rows?.length) return;

    setHeavySectionsReady({
      hourly: false,
      table: false,
      cards: false,
    });

    const timers: number[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timers.push(window.setTimeout(fn, delay));
    };

    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, hourly: true })),
      0,
    );
    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, table: true })),
      120,
    );
    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, cards: true })),
      240,
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [data?.rows?.length, selectedBucket]);

  if (isLoading) return <RekapSkeleton />;

  if (isError || data?.error) {
    return (
      <div className='flex flex-col items-center justify-center gap-4 py-12'>
        <p className='text-sm text-(--text-secondary)'>
          {data?.error || 'Gagal memuat data. Klik refresh untuk mencoba lagi.'}
        </p>
        <button
          onClick={() => refetch()}
          className='flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
        >
          Refresh
        </button>
      </div>
    );
  }

  if (!data?.rows?.length) {
    return (
      <div className='flex flex-col items-center gap-3 py-12'>
        <p className='text-sm text-(--text-muted)'>
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const fallbackSummary = computeSummary(data.rows);
  const displaySummary = fallbackSummary;
  const ks = data.kpiSummary;
  const customerPriorityValue =
    selectedBucket === 'kpi_customer'
      ? data.bucketSummary?.total ?? data.kpiSummary?.kpiCustomer ?? 0
      : data.kpiSummary?.kpiCustomer ?? 0;
  const priorityOverviewTotal =
    selectedBucket === 'kpi_customer'
      ? customerPriorityValue
      : data.kpiSummary?.total ?? 0;
  const overview = data.workboardSummary;
  const overviewOpen =
    selectedBucket === 'kpi_customer'
      ? data.bucketSummary?.open ?? overview?.open ?? 0
      : overview?.open ?? 0;
  const overviewClose =
    selectedBucket === 'kpi_customer'
      ? data.bucketSummary?.close ?? overview?.close ?? 0
      : overview?.close ?? 0;
  const flowSummary =
    selectedBucket === 'kpi_customer'
      ? data.bucketSummary
      : overview;
  const flow = computeStatusFlow(flowSummary);

  const PRIORITY_BUCKET_DEFS: {
    label: string;
    key: keyof BucketBreakdownCounts;
    apiValue: string;
  }[] = [
    { label: 'Customer', key: 'kpiCustomer', apiValue: 'kpi_customer' },
    { label: 'Proactive', key: 'kpiProactive', apiValue: 'kpi_proactive' },
    { label: 'Unspec', key: 'nonKpiUnspec', apiValue: 'non_kpi_unspec' },
    { label: 'Non Technical', key: 'nonTechnical', apiValue: 'non_technical' },
    { label: 'SQM Update', key: 'sqmUpdate', apiValue: 'sqm_update' },
    { label: 'Obsolete', key: 'obsolete', apiValue: 'obsolete' },
  ];
  const priorityRows = PRIORITY_BUCKET_DEFS.map((def) => {
    const isCustomerView =
      selectedBucket === 'kpi_customer' && def.key === 'kpiCustomer';
    const src = isCustomerView
      ? data.bucketSummary
      : data.bucketBreakdown?.[def.key];
    return {
      key: def.key,
      label: def.label,
      count: src?.total ?? 0,
      open: src?.open ?? 0,
      assigned: src?.assigned ?? 0,
      onProgress: src?.onProgress ?? 0,
      close: src?.close ?? 0,
      active: selectedBucket === def.apiValue,
    };
  }).sort((a, b) => b.count - a.count);
  const priorityMax = Math.max(1, ...priorityRows.map((row) => row.count));
  const displayTitle = data.title.replace(/\s*\[[^\]]+\]\s*$/, '').trim();

  const handleCapture = async (format: CaptureFormat) => {
    if (!captureTargetRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bucketSlug = selectedBucket.replace(/[^a-z0-9]+/gi, '-');
      const syncSlug = data.syncDate.replace(/[^0-9a-z]+/gi, '-');
      const timestampSlug = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');

      await captureElementAsImage(captureTargetRef.current, {
        format,
        filename: `rekap-workorder-${bucketSlug}-${syncSlug}-${timestampSlug}`,
        scale: 2,
      });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className='space-y-4'>
      <section className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
        <div className='border-b border-(--border) px-4 py-3 md:px-5 md:py-3'>
          <div className='flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between'>
            <div className='max-w-3xl'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-[16px] font-semibold tracking-tight text-(--text-primary) md:text-[17px]'>
                  {displayTitle}
                </h2>
                <span className='bg-surface rounded-full border border-(--border) px-2 py-0.5 text-[9px] font-semibold text-(--text-muted)'>
                  {data.syncDate}
                </span>
              </div>
              {data.subtitle && (
                <p className='mt-1.5 max-w-2xl text-[12px] leading-5 text-(--text-secondary)'>
                  {data.subtitle}
                </p>
              )}
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-(--border) bg-(--surface) px-2.5 py-0.5 text-[10px] font-semibold text-(--text-secondary)'>
                  {data.rows.length.toLocaleString('id-ID')} service area
                </span>
              </div>
            </div>

            <div className='flex flex-col gap-2.5 lg:min-w-[18rem]'>
              {data.timestamp && (
                <DataFreshnessBadge
                  generatedAt={data.timestamp}
                  onRefresh={() => refetch()}
                  isRefreshing={isFetching}
                />
              )}
              <div className='flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2'>
                <span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)'>
                  Branch
                </span>
                <BranchFilterSelect
                  className='min-w-36'
                  initialBranch={branch}
                />
              </div>
            </div>
          </div>
        </div>

        <div className='border-b border-(--border) px-4 py-3 md:px-5'>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
            <SummaryTile
              label='Total WO'
              value={formatNumber(displaySummary.total)}
              sub={`${data.rows.length} service area`}
              tone='slate'
              icon={<Activity className='h-4 w-4' />}
            />
            <SummaryTile
              label='Open'
              value={formatNumber(displaySummary.open)}
              sub='perlu diproses'
              tone='red'
              icon={<Clock3 className='h-4 w-4' />}
            >
              <p className='mt-2 text-[10px] text-(--text-muted)'>
                B2B {formatNumber(displaySummary.openB2b)} · B2C{' '}
                {formatNumber(displaySummary.openB2c)}
              </p>
              <div className='mt-2'>
                <StatusFlowBar flow={flow} showLegend={false} />
              </div>
            </SummaryTile>
            <SummaryTile
              label='Close'
              value={formatNumber(displaySummary.close)}
              sub={`${displaySummary.closeRate}% rate`}
              tone='green'
              icon={<CheckCircle2 className='h-4 w-4' />}
            >
              <p className='mt-2 text-[10px] text-(--text-muted)'>
                B2B {formatNumber(displaySummary.closeB2b)} · B2C{' '}
                {formatNumber(displaySummary.closeB2c)}
              </p>
              <div className='mt-2 flex items-center gap-2'>
                <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-3)'>
                  <div
                    className='h-full rounded-full transition-all'
                    style={{
                      width: `${displaySummary.closeRate}%`,
                      background:
                        displaySummary.closeRate >= 80
                          ? '#22c55e'
                          : displaySummary.closeRate >= 50
                            ? '#f59e0b'
                            : '#ef4444',
                    }}
                  />
                </div>
                <span className='font-mono text-[9px] font-bold tabular-nums text-(--text-muted)'>
                  {displaySummary.closeRate}%
                </span>
              </div>
            </SummaryTile>
            <SummaryTile
              label='Teknisi'
              value={formatNumber(displaySummary.teknisi)}
              sub={
                displaySummary.registered > 0
                  ? `${formatNumber(displaySummary.registered)} terdaftar`
                  : 'absen hari ini'
              }
              tone='blue'
              icon={<Users className='h-4 w-4' />}
            >
              {displaySummary.registered > 0 && (
                <div className='mt-2 flex items-center gap-2'>
                  <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-3)'>
                    <div
                      className='h-full rounded-full bg-blue-500 transition-all'
                      style={{ width: `${displaySummary.coverage}%` }}
                    />
                  </div>
                  <span className='font-mono text-[9px] font-bold tabular-nums text-(--text-muted)'>
                    {displaySummary.coverage}%
                  </span>
                </div>
              )}
            </SummaryTile>
            <SummaryTile
              label='WO/Teknisi'
              value={displaySummary.woPerTeknisi}
              sub='open load'
              tone='slate'
              icon={
                <RefreshCw
                  className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                />
              }
            >
              <KpiHealthDot
                value={Number(displaySummary.woPerTeknisi) || 0}
                good='Healthy'
                moderate='Moderate'
              />
            </SummaryTile>
          </div>

          {flow && (
            <div className='mt-3 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
                  Status workboard
                </p>
                <p className='text-[10px] text-(--text-muted)'>
                  pipeline open → close
                </p>
              </div>
              <div className='mt-2'>
                <StatusFlowBar flow={flow} />
              </div>
            </div>
          )}
        </div>

        <div className='border-b border-(--border) px-4 py-3 md:px-5'>
          <RekapTrendMiniChart
            bucket={selectedBucket}
            branch={branch || undefined}
          />
        </div>

        <div className='grid gap-4 px-4 py-3 md:grid-cols-2 md:px-5'>
          {ks && data.bucketBreakdown && (
            <div className='rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
                  Priority overview
                </p>
                <p className='flex items-baseline gap-1.5 text-[10px] text-(--text-muted)'>
                  <span className='font-mono font-semibold tabular-nums text-(--text-primary)'>
                    {formatNumber(overviewOpen)}
                  </span>
                  open
                  <span className='mx-0.5 inline-block h-1 w-1 rounded-full bg-(--border)' />
                  <span className='font-mono font-semibold tabular-nums text-(--text-primary)'>
                    {formatNumber(overviewClose)}
                  </span>
                  close
                </p>
              </div>

              <div className='mt-3 flex items-baseline gap-2'>
                <p className='text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums text-(--text-primary)'>
                  {formatNumber(priorityOverviewTotal)}
                </p>
                <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)'>
                  Total tiket
                </p>
              </div>

              <div className='mt-3 h-px bg-(--border)' />

              <ul className='mt-2.5 space-y-0.5'>
                {priorityRows.map((row) => (
                  <li
                    key={row.key}
                    className='grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--surface) sm:grid-cols-[7.5rem_1fr_auto]'
                  >
                    <span
                      className={`flex min-w-0 items-center gap-1.5 truncate text-[10px] uppercase tracking-[0.16em] ${
                        row.active
                          ? 'font-semibold text-(--text-primary)'
                          : 'text-(--text-secondary)'
                      }`}
                    >
                      {row.active && (
                        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400' />
                      )}
                      {row.label}
                    </span>

                    <div className='min-w-0'>
                      <div className='h-1.5 overflow-hidden rounded-full bg-(--surface-3)'>
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            row.active
                              ? 'bg-blue-600 dark:bg-blue-400'
                              : 'bg-blue-500/55 dark:bg-blue-400/45'
                          }`}
                          style={{ width: `${(row.count / priorityMax) * 100}%` }}
                        />
                      </div>
                    </div>

                    <span className='flex items-baseline justify-end gap-2 whitespace-nowrap text-right'>
                      <span
                        className={`font-mono text-[12px] tabular-nums ${
                          row.count > 0
                            ? 'font-semibold text-(--text-primary)'
                            : 'font-medium text-(--text-muted)'
                        }`}
                      >
                        {formatNumber(row.count)}
                      </span>
                      {row.count > 0 && (
                        <span
                          className='text-[10px] text-(--text-muted)'
                          title='open/close'
                        >
                          {formatNumber(row.open)}/{formatNumber(row.close)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className='space-y-3'>
            <div className='rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'>
              <AttentionList rows={data.rows} aging={data.aging} />
            </div>
            <div className='rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'>
              <AgingBlock aging={data.aging} />
            </div>
          </div>
        </div>
      </section>
      <div className='grid gap-4'>
        <section className='rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          {heavySectionsReady.hourly ? (
            <RekapWorkorderHourlyClose
              bucket={selectedBucket}
              branch={branch || undefined}
            />
          ) : (
            <div className='h-60 animate-pulse rounded-[28px] bg-(--surface-2)' />
          )}
        </section>
      </div>

      <div className='hidden xl:block'>
        <section className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.75))] px-4 py-3.5 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.45),rgba(15,23,42,0.2))]'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div className='max-w-3xl pb-0.5'>
                <p className='text-[10px] font-bold tracking-[0.2em] text-(--text-secondary) uppercase'>
                  Bucket filter
                </p>
                <p className='mt-1 text-[12px] font-medium text-(--text-secondary)'>
                  Pilih bucket tanpa perlu kembali ke bagian atas halaman.
                </p>
              </div>
              <div className='w-full max-w-184 xl:w-auto xl:justify-self-end'>
                <BucketFilterBar
                  selectedBucket={selectedBucket}
                  onChange={setSelectedBucket}
                />
              </div>
            </div>
          </div>
          <div className='p-0'>
            {heavySectionsReady.table ? (
              <RekapWorkorderTable
                captureTargetRef={captureTargetRef}
                isCapturing={isCapturing}
                onCapture={handleCapture}
                rows={data.rows}
                timestamp={data.timestamp}
                detailMode={
                  selectedBucket !== 'all' ? selectedBucket : undefined
                }
                bucketSummary={data.bucketSummary}
                onCellClick={setCellSpec}
              />
            ) : (
              <div className='h-105 animate-pulse bg-(--surface-2)' />
            )}
          </div>
        </section>
      </div>

      <div className='xl:hidden'>
        <div className='rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) px-4 py-4'>
            <div className='space-y-3'>
              <div>
                <p className='text-[10px] font-bold tracking-[0.2em] text-(--text-secondary) uppercase'>
                  Bucket filter
                </p>
                <p className='mt-1 text-[12px] leading-5 text-(--text-secondary)'>
                  Pilih bucket tanpa perlu kembali ke bagian atas halaman.
                </p>
              </div>
              <MobileBucketFilterGrid
                selectedBucket={selectedBucket}
                onChange={setSelectedBucket}
              />
            </div>
          </div>
          <div>
            {heavySectionsReady.cards ? (
              <RekapWorkorderCards
                rows={data.rows}
                detailMode={
                  selectedBucket !== 'all' ? selectedBucket : undefined
                }
                onCellClick={setCellSpec}
              />
            ) : (
              <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
            )}
          </div>
        </div>
      </div>

      <RekapTicketMembersModal
        open={!!cellSpec}
        spec={cellSpec}
        onClose={() => setCellSpec(null)}
        workzone={workzone || undefined}
        branch={branch || undefined}
      />
    </div>
  );
}
