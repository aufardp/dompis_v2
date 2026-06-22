import { Ticket } from '@/app/types/ticket';
import { getMaxTtrInfo } from '../TeknisiDashboard/utils/ttr';

interface SlaSectionProps {
  ticket: Ticket;
  ttrRemaining: { label: string; isOverdue: boolean } | null;
  slaPercent: number;
  slaBarColor: string;
  isClosed: boolean;
}

export default function SlaSection({
  ticket,
  ttrRemaining,
  slaPercent,
  slaBarColor,
  isClosed,
}: SlaSectionProps) {
  if (isClosed) return null;

  return (
    <>
      {/* TTR & SLA Section */}
      <div className='rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800'>
        <div className='mb-3 flex items-end justify-between'>
          <div>
            <p className='text-[10px] font-black tracking-widest text-slate-400 uppercase dark:text-slate-500'>
              Sisa Waktu
            </p>
            <p
              className={`text-2xl font-black ${ttrRemaining?.isOverdue ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'}`}
            >
              {ttrRemaining?.label}
            </p>
          </div>
          <div className='text-right'>
            <p className='text-[10px] font-black tracking-widest text-slate-400 uppercase dark:text-slate-500'>
              Max TTR
            </p>
            <p className='text-xs font-bold text-slate-600 dark:text-slate-300'>
              {getMaxTtrInfo(ticket)}
            </p>
          </div>
        </div>
        <div className='h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700'>
          <div
            className={`h-full transition-all duration-500 ${slaBarColor}`}
            style={{ width: `${slaPercent}%` }}
          />
        </div>
      </div>

      {/* MAX TTR Warning Box */}
      {ttrRemaining && (
        <div className='flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-500/20 dark:bg-orange-500/10'>
          <div>
            <p className='mb-0.5 text-[10px] font-bold tracking-wide text-orange-500 uppercase'>
              ⚠ Batas Waktu (Max TTR)
            </p>
            <p className='text-sm font-bold text-orange-800 dark:text-orange-300'>
              {getMaxTtrInfo(ticket)}
            </p>
          </div>
          <div className='text-right'>
            <p className='mb-0.5 text-[10px] font-semibold tracking-wide text-orange-400 uppercase'>
              {ttrRemaining.isOverdue ? 'Terlewat' : 'Sisa Waktu'}
            </p>
            <p
              className={`text-xl font-black tabular-nums ${ttrRemaining.isOverdue ? 'text-red-600' : 'text-orange-700 dark:text-orange-300'}`}
            >
              {ttrRemaining.label}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
