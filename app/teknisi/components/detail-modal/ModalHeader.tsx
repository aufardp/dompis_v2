import StatusBadge from './StatusBadge';
import AgeBadge from './AgeBadge';

interface ModalHeaderProps {
  ticket: string;
  summary?: string | null;
  symptom?: string | null;
  status: string;
  reportedDate: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  jenisTiket?: string | null;
  isClosed?: boolean;
  onClose: () => void;
  // Props baru untuk warning banner
  warning?: string | null;
  warningType?: 'error' | 'upload';
  onDismissWarning?: () => void;
}

export default function ModalHeader({
  ticket,
  summary,
  symptom,
  status,
  jenisTiket,
  reportedDate,
  hasilVisit,
  closedAt,
  isClosed = false,
  onClose,
  warning,
  warningType,
  onDismissWarning,
}: ModalHeaderProps) {
  const title = summary || symptom || ticket;

  return (
    <div className='sticky top-0 z-20 shrink-0 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900'>
      {/* Wrapper untuk rows 1-3 dengan padding */}
      <div className='px-4 pt-3 pb-3'>
        {/* Row 1: INC ID + Close button */}
        <div className='mb-2.5 flex items-center justify-between'>
          <span className='font-mono text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 truncate mr-2'>
            {ticket}
          </span>
          <button
            onClick={onClose}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            aria-label='Close'
          >
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        {/* Row 2: Badges */}
        <div className='mb-2.5 flex flex-wrap gap-1.5'>
          <StatusBadge status={status} />
          {jenisTiket && (
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'>
              {jenisTiket}
            </span>
          )}
          {/* AgeBadge: hanya tampil saat tiket BELUM closed */}
          {!isClosed && (
            <AgeBadge
              reportedDate={reportedDate}
              hasilVisit={hasilVisit}
              closedAt={closedAt}
            />
          )}
        </div>

        {/* Row 3: Title */}
        <h2 className='line-clamp-2 max-h-[2.8em] overflow-hidden text-[14px] leading-snug font-bold text-slate-900 dark:text-slate-100'>
          {title}
        </h2>
      </div>

      {/* Row 4: Warning banner — conditional, full-width */}
      {warning && (
        <div
          className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold ${
            warningType === 'upload'
              ? 'bg-orange-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          <div className='flex min-w-0 items-center gap-1.5'>
            <span className='shrink-0'>
              {warningType === 'upload' ? '⚠️' : '⛔'}
            </span>
            <span className='truncate'>{warning}</span>
          </div>
          {onDismissWarning && (
            <button
              type='button'
              onClick={onDismissWarning}
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors'
              aria-label='Tutup peringatan'
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
