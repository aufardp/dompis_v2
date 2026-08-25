'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useAdminToast } from '@/app/admin/components/dashboard/admin-toast';

interface KpiTargetRow {
  metricKey: string;
  targetValue: number;
  updatedAt: string;
}

const METRIC_LABELS: Record<string, string> = {
  ttr_comply_manja: 'TTR Comply 3 Jam (MANJA)',
  ttr_comply_diamond: 'TTR Comply 3 Jam (Diamond)',
  ttr_comply_platinum: 'TTR Comply 6 Jam (Platinum)',
  ttr_comply_gold: 'TTR Comply 12 Jam (Gold)',
  ttr_comply_reguler: 'TTR Comply 24 Jam (Reguler)',
  ttr_comply_sqm_4h: 'TTR Comply SQM 4 Jam',
  max_ticket_open: 'Maksimal Tiket Open',
  assurance_guarantee: 'Assurance Guarantee (Ggn Berulang)',
};

export default function KpiTargetsClient() {
  const { showSuccess, showError } = useAdminToast();
  const [targets, setTargets] = useState<KpiTargetRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetchWithAuth('/api/kpi-targets');
      const json = await res?.json().catch(() => null);
      if (json?.success) {
        setTargets(json.data);
        setDrafts(
          Object.fromEntries(
            (json.data as KpiTargetRow[]).map((t) => [t.metricKey, String(t.targetValue)]),
          ),
        );
      } else {
        showError(json?.message || 'Gagal memuat target KPI');
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async (metricKey: string) => {
    const raw = drafts[metricKey];
    const targetValue = Number(raw);
    if (!Number.isFinite(targetValue)) {
      showError('Nilai target harus berupa angka.');
      return;
    }

    setSavingKey(metricKey);
    const res = await fetchWithAuth('/api/kpi-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metricKey, targetValue }),
    });
    const json = await res?.json().catch(() => null);
    setSavingKey(null);

    if (json?.success) {
      setTargets((prev) =>
        prev.map((t) => (t.metricKey === metricKey ? json.data : t)),
      );
      showSuccess(`Target "${METRIC_LABELS[metricKey] ?? metricKey}" tersimpan.`);
    } else {
      showError(json?.message || 'Gagal menyimpan target');
    }
  };

  return (
    <div className='space-y-6'>
      <section className='overflow-hidden rounded-4xl border border-(--border) bg-(--surface) shadow-sm'>
        <div className='p-6 md:p-7'>
          <p className='text-[10px] font-bold tracking-[0.32em] text-(--text-secondary) uppercase'>
            Superadmin
          </p>
          <h1 className='mt-2 text-2xl font-semibold tracking-tight text-(--text-primary) md:text-3xl'>
            Target KPI
          </h1>
          <p className='mt-3 max-w-2xl text-sm leading-6 text-(--text-muted)'>
            Atur nilai target yang dipakai untuk menghitung persen achievement
            di halaman Operational Overview (TTR Compliance, Assurance
            Guarantee, dst). Satu nilai berlaku sampai diubah lagi.
          </p>
        </div>
      </section>

      <section className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='h-14 animate-pulse rounded-2xl bg-(--surface-2)' />
            ))}
          </div>
        ) : (
          <div className='space-y-2'>
            {targets.map((t) => (
              <div
                key={t.metricKey}
                className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--surface-2) px-4 py-3'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-(--text-primary)'>
                    {METRIC_LABELS[t.metricKey] ?? t.metricKey}
                  </p>
                  <p className='mt-0.5 text-[11px] text-(--text-muted)'>
                    {t.metricKey} · diubah{' '}
                    {new Date(t.updatedAt).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <input
                    type='number'
                    step='0.01'
                    value={drafts[t.metricKey] ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [t.metricKey]: e.target.value }))
                    }
                    className='w-28 rounded-xl border border-(--border) bg-(--surface) px-3 py-1.5 text-right text-sm font-semibold text-(--text-primary) focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none'
                  />
                  <button
                    onClick={() => handleSave(t.metricKey)}
                    disabled={savingKey === t.metricKey}
                    className='inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <Save size={13} />
                    {savingKey === t.metricKey ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
