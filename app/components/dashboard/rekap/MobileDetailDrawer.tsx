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
      <div className={`fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-slate-950 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-bold text-slate-950 dark:text-slate-50">{'saName' in row ? row.saName : row.workzone}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{'saName' in row ? row.area : ''}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
              <p className="mt-1 text-xl font-bold text-slate-950 dark:text-slate-50">{'grandTotal' in row ? row.grandTotal : row.totalOpen + row.totalClose}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Open</p>
              <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{row.totalOpen}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Close</p>
              <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{row.totalClose}</p>
            </div>
            <div className="rounded-lg bg-sky-50 p-3 dark:bg-sky-950/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">Rate</p>
              <p className="mt-1 text-xl font-bold text-sky-700 dark:text-sky-300">{closeRate(row.totalOpen, row.totalClose)}%</p>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bucket Aktif</p>
              <span className="text-xs text-slate-400">{activeBuckets.length} bucket</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activeBuckets.map((bkt) => (
                <div key={bkt.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{bkt.label}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">Op {bkt.data.open}</span>
                    <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Cl {bkt.data.close}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {workzones.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workzone</p>
              <div className="space-y-2">
                {workzones.map((wz: WorkzoneRow) => (
                  <div key={wz.workzone} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{wz.workzone}</p>
                      <p className="text-xs text-slate-400">{closeRate(wz.totalOpen, wz.totalClose)}% close</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded bg-slate-50 py-2 dark:bg-slate-900">
                        <p className="text-[10px] text-slate-400">Total</p>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{wz.totalOpen + wz.totalClose}</p>
                      </div>
                      <div className="rounded bg-red-50 py-2 dark:bg-red-950/30">
                        <p className="text-[10px] text-red-400">Open</p>
                        <p className="font-bold text-red-700 dark:text-red-300">{wz.totalOpen}</p>
                      </div>
                      <div className="rounded bg-emerald-50 py-2 dark:bg-emerald-950/30">
                        <p className="text-[10px] text-emerald-500">Close</p>
                        <p className="font-bold text-emerald-700 dark:text-emerald-300">{wz.totalClose}</p>
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
