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
          <span className='mr-2 truncate font-mono text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500'>
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
            <span
              className={`/* Dark Mode Support */ inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 shadow-sm shadow-slate-100/50 transition-all duration-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:shadow-none`}
            >
              {/* Ikon Tag/Kategori Mikro (SVG) */}
              <svg
                className='h-3 w-3 text-slate-400 dark:text-slate-500'
                fill='none'
                viewBox='0 0 24 24'
                strokeWidth='2.5'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a2.25 2.25 0 0 0 3.182 0l4.318-4.318a2.25 2.25 0 0 0 0-3.182L11.16 3.659A2.25 2.25 0 0 0 9.568 3Z'
                />
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M6 6h.008v.008H6V6Z'
                />
              </svg>

              {/* Teks Jenis Tiket */}
              <span className='capitalize'>{jenisTiket.toLowerCase()}</span>
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
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30'
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
