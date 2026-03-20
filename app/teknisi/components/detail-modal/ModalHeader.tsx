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
}: ModalHeaderProps) {
  const title = summary || symptom || ticket;

  return (
    <div className='sticky top-0 z-20 shrink-0 border-b border-slate-100 bg-white px-4 pt-3 pb-3 dark:border-slate-800 dark:bg-slate-900'>
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
  );
}
