import { Check } from 'lucide-react';
import { Teknisi } from '@/app/types/teknisi';

interface Props {
  tech: Teknisi;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}

function formatTtr(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) {
    return null;
  }
  const h = Number(hours);
  if (h <= 0) return null;
  if (h >= 24) return `${(h / 24).toFixed(1)} hr`;
  return `${h.toFixed(1)} jam`;
}

function describeLoad(score: number): string {
  if (Number.isNaN(Number(score))) return 'tidak diketahui';
  const s = Number(score);
  if (s < 34) return 'Ringan';
  if (s <= 67) return 'Sedang';
  return 'Berat';
}

export default function TechnicianCard({
  tech,
  isSelected,
  isCurrent,
  onSelect,
}: Props) {
  const hasWorkload =
    typeof tech.active_tickets === 'number' ||
    typeof tech.avg_ttr_hours === 'number';

  const ttr = formatTtr(tech.avg_ttr_hours);

  return (
    <button
      type='button'
      onClick={onSelect}
      className={
        'group flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition focus:ring-2 focus:ring-blue-500/40 focus:outline-none ' +
        (isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:bg-gray-50')
      }
      aria-pressed={isSelected}
    >
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='truncate font-medium text-gray-900'>
            {tech.nama || '-'}
          </p>
          {tech.recommended && (
            <span className='inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white'>
              Saran
            </span>
          )}
        </div>
        <p className='mt-0.5 text-xs text-gray-500'>NIK: {tech.nik || '-'}</p>
        <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
          <span
            className={
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ' +
              (tech.checked_in_today
                ? 'bg-sky-50 text-sky-700'
                : 'bg-slate-100 text-slate-600')
            }
          >
            {tech.checked_in_today ? 'Sudah Absen' : 'Belum Absen'}
          </span>
          {isCurrent && (
            <span className='inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700'>
              Currently assigned
            </span>
          )}
          {hasWorkload && (
            <>
              <span
                className={
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                  (tech.overloaded
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-600')
                }
                title='Jumlah tiket yang sedang aktif dikerjakan oleh teknisi ini'
              >
                {tech.active_tickets ?? 0} tiket aktif
                {tech.overloaded ? ' · penuh' : ''}
              </span>
              {typeof tech.load_score === 'number' && (
                <span
                  className={
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                    (tech.overloaded
                      ? 'bg-red-50 text-red-700'
                      : 'bg-indigo-50 text-indigo-700')
                  }
                  title='Tingkat kesibukan dari kombinasi tiket aktif, rata-rata waktu kerjakan, dan tiket tertunda'
                >
                  beban {describeLoad(tech.load_score)}
                </span>
              )}
              {ttr && (
                <span
                  className='inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600'
                  title='Rata-rata waktu menyelesaikan tiket (30 hari terakhir)'
                >
                  TTR {ttr}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className={
          'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border transition ' +
          (isSelected
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-transparent group-hover:border-gray-400')
        }
        aria-hidden='true'
      >
        <Check size={14} />
      </div>
    </button>
  );
}