import clsx from 'clsx';
import { AlertTriangle, Check, OctagonAlert, X } from 'lucide-react';
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
  const normalizedStatus = (status ?? '').trim().toUpperCase();
  const knownStatus = new Set([
    'ASSIGNED',
    'ON_PROGRESS',
    'PENDING',
    'CLOSE',
    'CLOSED',
    'OPEN',
    'ESCALATED',
    'CANCELLED',
  ]);
  const statusForBadge = knownStatus.has(normalizedStatus)
    ? normalizedStatus
    : 'Unknown';

  function StatusStepper({ status: currentStatus }: { status: string }) {
    const steps = [
      { key: 'ASSIGNED', label: 'Assigned' },
      { key: 'ON_PROGRESS', label: 'Dikerjakan' },
      { key: 'PENDING', label: 'Pending' },
      { key: 'CLOSE', label: 'Selesai' },
    ];
    const order = ['ASSIGNED', 'ON_PROGRESS', 'PENDING', 'CLOSE'];
    const normalized =
      currentStatus.trim().toUpperCase() === 'CLOSED'
        ? 'CLOSE'
        : currentStatus.trim().toUpperCase();
    const currentIndex = order.indexOf(normalized);

    if (currentIndex === -1) return null;

    return (
      <div className='mb-2.5 flex items-center'>
        {steps.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div key={step.key} className='relative flex flex-1 flex-col items-center'>
              {i < steps.length - 1 && (
                <div
                  className={clsx(
                    'absolute top-[11px] left-1/2 h-0.5 w-full',
                    isDone ? 'bg-blue-500' : 'bg-(--border)',
                  )}
                />
              )}
              <div
                className={clsx(
                  'relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold',
                  isDone || isCurrent
                    ? 'bg-blue-500 text-white'
                    : 'bg-(--surface-2) text-(--text-tertiary)',
                  isCurrent && 'ring-2 ring-blue-200 dark:ring-blue-500/30',
                )}
              >
                {isDone ? <Check size={11} /> : i + 1}
              </div>
              <span
                className={clsx(
                  'mt-1 text-[9px]',
                  isCurrent
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'text-(--text-tertiary)',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className='sticky top-0 z-20 shrink-0 border-b border-(--border) bg-(--surface)'>
      {/* Wrapper untuk rows 1-3 dengan padding */}
      <div className='px-4 pt-3 pb-3'>
        {/* Row 1: INC ID + Close button */}
        <div className='mb-2.5 flex items-center justify-between'>
          <span className='mr-2 truncate font-mono text-[11px] font-semibold tracking-wider text-(--text-tertiary)'>
            {ticket}
          </span>
          <button
            onClick={onClose}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--surface-2) text-(--text-secondary) transition-colors hover:bg-(--surface-3)'
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
          <StatusBadge status={statusForBadge} />
          {jenisTiket && (
            <span
              className='inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-(--text-secondary) shadow-sm transition-all duration-200'
            >
              <svg
                className='h-3 w-3 text-(--text-tertiary)'
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
          {!isClosed && (
            <AgeBadge
              reportedDate={reportedDate}
              hasilVisit={hasilVisit}
              closedAt={closedAt}
            />
          )}
        </div>

        <StatusStepper status={status} />

        {/* Row 3: Title */}
        <h2 className='line-clamp-2 max-h-[2.8em] overflow-hidden text-[14px] leading-snug font-bold text-(--text-primary)'>
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
              {warningType === 'upload' ? (
                <AlertTriangle size={14} />
              ) : (
                <OctagonAlert size={14} />
              )}
            </span>
            <span className='truncate'>{warning}</span>
          </div>
          {onDismissWarning && (
            <button
              type='button'
              onClick={onDismissWarning}
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 dark:bg-black/15 dark:hover:bg-black/25'
              aria-label='Tutup peringatan'
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
