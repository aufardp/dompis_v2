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
    <div className='sticky top-0 z-20 shrink-0 border-b border-slate-100 bg-white px-5 pt-3 pb-4'>
      {/* Row 1: INC ID + Close button */}
      <div className='mb-2.5 flex items-center justify-between'>
        <span className='font-mono text-[11px] font-semibold tracking-wider text-slate-400'>
          {ticket}
        </span>
        <button
          onClick={onClose}
          className='flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200'
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
          <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500'>
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
      <h2 className='line-clamp-2 text-[15px] leading-snug font-bold text-slate-900'>
        {title}
      </h2>
    </div>
  );
}
