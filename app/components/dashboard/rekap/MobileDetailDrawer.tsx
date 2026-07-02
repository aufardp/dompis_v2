'use client';

import { X } from 'lucide-react';

interface SegCount { open: number; close: number; }

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

interface MobileDetailDrawerProps {
  row: SARow | WorkzoneRow;
  isOpen: boolean;
  onClose: () => void;
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

function closeRate(open: number, close: number): number {
  const total = open + close;
  return total > 0 ? Math.round((close / total) * 100) : 0;
}

function getBucketValue(row: SARow | WorkzoneRow, key: BucketKey): SegCount {
  return row.buckets[key];
}

export default function MobileDetailDrawer({ row, isOpen, onClose }: MobileDetailDrawerProps) {
  const activeBuckets = BUCKETS.map((bkt) => ({
    ...bkt,
    data: getBucketValue(row, bkt.key),
  })).filter((bkt) => bkt.data.open > 0 || bkt.data.close > 0);

  const workzones = 'workzones' in row ? row.workzones : [];

  return (
    <>
      {isOpen && (
        <button className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-label="Tutup detail" />
      )}
      <div className={`fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[28px] border-t border-(--border) bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-[0_-24px_60px_-36px_rgba(15,23,42,0.45)] transition-transform duration-300 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="sticky top-0 z-10 border-b border-(--border) bg-white/90 px-4 py-3 backdrop-blur dark:bg-slate-950/90">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.2em] text-(--text-muted) uppercase">
                Detail
              </p>
              <h3 className="truncate text-[15px] font-bold text-(--text-primary)">{'saName' in row ? row.saName : row.workzone}</h3>
              <p className="text-[11px] text-(--text-secondary)">{'saName' in row ? row.area : ''}</p>
            </div>
            <button onClick={onClose} className="rounded-2xl border border-(--border) bg-(--surface) p-2 text-(--text-secondary) hover:bg-(--surface-2)">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[20px] border border-(--border) bg-(--surface) p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-(--text-muted)">Total</p>
              <p className="mt-1 text-[1.15rem] font-bold text-(--text-primary) tabular-nums">{'grandTotal' in row ? row.grandTotal : row.totalOpen + row.totalClose}</p>
            </div>
            <div className="rounded-[20px] border border-red-500/15 bg-red-500/8 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-red-600/70">Open</p>
              <p className="mt-1 text-[1.15rem] font-bold text-red-600 tabular-nums dark:text-red-300">{row.totalOpen}</p>
            </div>
            <div className="rounded-[20px] border border-emerald-500/15 bg-emerald-500/8 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-600/70">Close</p>
              <p className="mt-1 text-[1.15rem] font-bold text-emerald-600 tabular-nums dark:text-emerald-300">{row.totalClose}</p>
            </div>
            <div className="rounded-[20px] border border-blue-500/15 bg-blue-500/8 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-600/70">Rate</p>
              <p className="mt-1 text-[1.15rem] font-bold text-blue-600 tabular-nums dark:text-blue-300">{closeRate(row.totalOpen, row.totalClose)}%</p>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--text-muted)">Bucket Aktif</p>
              <span className="text-[11px] text-(--text-secondary)">{activeBuckets.length} bucket</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeBuckets.map((bkt) => (
                <div key={bkt.key} className="rounded-[20px] border border-(--border) bg-(--surface) p-3">
                  <p className="text-[11px] font-semibold text-(--text-primary)">{bkt.label}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-full bg-red-500/8 px-2 py-1 text-[11px] font-bold text-red-600 dark:text-red-300">Op {bkt.data.open}</span>
                    <span className="rounded-full bg-emerald-500/8 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">Cl {bkt.data.close}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {workzones.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-(--text-muted)">Workzone</p>
              <div className="space-y-2">
                {workzones.map((wz: WorkzoneRow) => (
                  <div key={wz.workzone} className="rounded-[20px] border border-(--border) bg-(--surface) p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[11px] font-bold text-(--text-primary)">{wz.workzone}</p>
                      <p className="text-[11px] text-(--text-secondary)">{closeRate(wz.totalOpen, wz.totalClose)}% close</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-[18px] bg-(--surface-2) py-2">
                        <p className="text-[10px] text-(--text-muted)">Total</p>
                        <p className="font-bold text-(--text-primary) tabular-nums">{wz.totalOpen + wz.totalClose}</p>
                      </div>
                      <div className="rounded-[18px] bg-red-500/8 py-2">
                        <p className="text-[10px] text-red-500">Open</p>
                        <p className="font-bold text-red-700 tabular-nums dark:text-red-300">{wz.totalOpen}</p>
                      </div>
                      <div className="rounded-[18px] bg-emerald-500/8 py-2">
                        <p className="text-[10px] text-emerald-500">Close</p>
                        <p className="font-bold text-emerald-700 tabular-nums dark:text-emerald-300">{wz.totalClose}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
