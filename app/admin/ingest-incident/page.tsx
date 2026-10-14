'use client';

import { useState, useCallback } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, PlayCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/app/libs/utils';

export default function IngestIncidentPage() {
  const router = useRouter();
  const [incident, setIncident] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleIngest = useCallback(async () => {
    if (!incident.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/admin/ingest-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident }),
      });
      const json = await res.json();
      setResult({ success: json.success, message: json.message });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    } finally {
      setLoading(false);
    }
  }, [incident]);

  return (
    <AdminLayout>
      <div className='max-w-2xl space-y-6'>
        <button
          onClick={() => router.back()}
          className='flex items-center gap-2 text-sm text-(--text-muted) hover:text-(--text-primary) transition'
        >
          <ArrowLeft className='h-4 w-4' />
          Kembali
        </button>

        <div className='rounded-2xl border border-(--border) bg-(--surface) p-6'>
          <div className='flex items-center gap-3 mb-1'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500'>
              <PlayCircle className='h-5 w-5' />
            </div>
            <div>
              <h1 className='font-outfit text-lg font-bold text-(--text-primary)'>
                Tarik Insiden Tunggal
              </h1>
              <p className='text-xs text-(--text-muted)'>
                Fetch dari Nossa → ingestion → projection
              </p>
            </div>
          </div>

          <div className='mt-5 space-y-4'>
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-(--text-secondary) uppercase tracking-wider'>
                Incident ID
              </label>
              <input
                type='text'
                value={incident}
                onChange={(e) => setIncident(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleIngest()}
                placeholder='Contoh: INC51123643'
                className={cn(
                  'w-full rounded-xl border border-(--border) bg-(--surface-2) px-4 py-2.5 text-sm text-(--text-primary)',
                  'placeholder:text-(--text-muted) focus:border-blue-400/60 focus:outline-none focus:ring-1 focus:ring-blue-400/20',
                )}
              />
              <p className='mt-1.5 text-[11px] text-(--text-muted)'>
                Data akan melalui validasi duplikasi terhadap <code>ticket_raw</code> dan{' '}
                <code>ticket</code> sebelum diproyeksikan.
              </p>
            </div>

            <button
              onClick={handleIngest}
              disabled={loading || !incident.trim()}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                loading || !incident.trim()
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-white/5 dark:text-(--text-muted)'
                  : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20',
              )}
            >
              {loading ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Memproses...
                </>
              ) : (
                <>
                  <PlayCircle className='h-4 w-4' />
                  Tarik & Proyeksikan
                </>
              )}
            </button>

            {result && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
                  result.success
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/5 text-red-400',
                )}
              >
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                <p>{result.message}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
