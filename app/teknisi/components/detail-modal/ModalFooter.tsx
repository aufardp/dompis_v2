// ── ActionButton ──────────────────────────────────────────────────────────────

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'blocked';
  className?: string;
  loading?: boolean;
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
  loading,
}: ActionButtonProps) {
  const base =
    'flex h-[50px] items-center justify-center gap-2 rounded-2xl text-[13.5px] font-black tracking-[0.01em] transition-all active:scale-[0.97] disabled:cursor-not-allowed';

  const variants: Record<NonNullable<ActionButtonProps['variant']>, string> = {
    primary:
      'flex-1 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_4px_14px_rgba(99,102,241,0.30)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.40)] disabled:opacity-50 disabled:shadow-none',
    secondary:
      'flex-1 border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    success:
      'flex-1 bg-gradient-to-br from-green-600 to-emerald-600 text-white shadow-[0_4px_14px_rgba(22,163,74,0.28)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.36)] disabled:opacity-50 disabled:shadow-none',
    // Visually communicates "blocked — action needed" without looking broken
    blocked:
      'flex-1 border-[1.5px] border-slate-200 bg-slate-100 text-slate-400 disabled:cursor-not-allowed',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? (
        <>
          <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
          Memproses...
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ── PhotoButton ───────────────────────────────────────────────────────────────

interface PhotoButtonProps {
  onClick?: () => void;
  photoCount: number;
  photoRequired: number;
  disabled?: boolean;
}

function PhotoButton({
  onClick,
  photoCount,
  photoRequired,
  disabled,
}: PhotoButtonProps) {
  const isComplete = photoCount >= photoRequired;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-12.5 w-14 shrink-0 items-center justify-center rounded-2xl border-[1.5px] text-xl transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
        isComplete ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      📷
      <span
        className={`absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-[9px] font-black text-white ${
          isComplete ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        {photoCount}/{photoRequired}
      </span>
    </button>
  );
}

// ── RequirementBar ────────────────────────────────────────────────────────────
// Shows at-a-glance what's still needed before Close is allowed.

interface RequirementBarProps {
  photoCount: number;
  photoRequired: number;
  isRcaIncomplete: boolean;
  isEvidenceIncomplete: boolean;
}

function RequirementBar({
  photoCount,
  photoRequired,
  isRcaIncomplete,
  isEvidenceIncomplete,
}: RequirementBarProps) {
  const photoOk = !isEvidenceIncomplete && photoCount >= photoRequired;
  const rcaOk = !isRcaIncomplete;

  // Don't render bar if everything is already complete
  if (photoOk && rcaOk) return null;

  return (
    <div className='flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2'>
      <span className='flex-1 text-[11px] font-bold text-slate-500'>
        Syarat close:
      </span>
      <div className='flex gap-1.5'>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
            photoOk
              ? 'border-green-200 bg-green-50 text-green-600'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          📷 {photoCount}/{photoRequired}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
            rcaOk
              ? 'border-green-200 bg-green-50 text-green-600'
              : 'border-amber-200 bg-amber-50 text-amber-600'
          }`}
        >
          {rcaOk ? '✓' : '⚠'} RCA
        </span>
      </div>
    </div>
  );
}

// ── CloseButton ───────────────────────────────────────────────────────────────
// Full-emphasis close action — intentionally the largest, most prominent element.

interface CloseButtonProps {
  canClose: boolean;
  loading: boolean;
  isEvidenceIncomplete: boolean;
  isRcaIncomplete: boolean;
  photoCount: number;
  photoRequired: number;
  onClick?: () => void;
}

function CloseButton({
  canClose,
  loading,
  isEvidenceIncomplete,
  isRcaIncomplete,
  photoCount,
  photoRequired,
  onClick,
}: CloseButtonProps) {
  const base =
    'w-full h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:cursor-not-allowed';

  if (loading) {
    return (
      <button
        disabled
        className={`${base} bg-linear-to-br from-green-600 to-emerald-600 text-white shadow-[0_6px_20px_rgba(22,163,74,0.35)]`}
      >
        <span className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
        <span className='text-[12px] font-bold tracking-wide opacity-80'>
          Menutup tiket...
        </span>
      </button>
    );
  }

  if (!canClose) {
    // Blocked state — tell user exactly what's missing
    const reason = isEvidenceIncomplete
      ? {
          icon: '📷',
          main: 'Lengkapi Foto',
          sub: `${photoCount} dari ${photoRequired} foto diunggah`,
        }
      : {
          icon: '📋',
          main: 'Lengkapi RCA',
          sub: 'Root cause analysis belum diisi',
        };

    return (
      <button
        disabled
        className={`${base} border-[1.5px] border-slate-200 bg-slate-100`}
      >
        <div className='flex items-center gap-2'>
          <span className='text-lg'>{reason.icon}</span>
          <span className='text-[14px] font-black text-slate-400'>
            {reason.main}
          </span>
        </div>
        <span className='text-[11px] font-medium text-slate-400'>
          {reason.sub}
        </span>
      </button>
    );
  }

  // Ready state — full green, unmissable
  return (
    <button
      onClick={onClick}
      className={`${base} bg-linear-to-br from-green-600 to-emerald-600 text-white shadow-[0_6px_20px_rgba(22,163,74,0.35)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(22,163,74,0.45)]`}
    >
      <div className='flex items-center gap-2'>
        <svg
          className='h-5 w-5'
          viewBox='0 0 16 16'
          fill='none'
          stroke='currentColor'
          strokeWidth='2.8'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <path d='M13.5 4.5l-8 8L2 9' />
        </svg>
        <span className='text-[16px] font-black tracking-wide'>
          Close Ticket
        </span>
      </div>
      <span className='text-[11px] font-semibold text-white/70'>
        Semua syarat terpenuhi ✓
      </span>
    </button>
  );
}

// ── ModalFooter ───────────────────────────────────────────────────────────────

interface ModalFooterProps {
  isOnProgress: boolean;
  isAssigned: boolean;
  isPending: boolean;
  isClosed: boolean;
  actionLoading: string | null;
  isRcaIncomplete: boolean;
  isEvidenceIncomplete: boolean;
  photoCount: number;
  photoRequired?: number;
  onUpdateClick: () => void;
  onPickup: () => void;
  onResume: () => void;
  onClose: () => void;
  onPhotoClick?: () => void;
}

export default function ModalFooter({
  isOnProgress,
  isAssigned,
  isPending,
  isClosed,
  actionLoading,
  isRcaIncomplete,
  isEvidenceIncomplete,
  photoCount,
  photoRequired = 2,
  onUpdateClick,
  onPickup,
  onResume,
  onClose,
  onPhotoClick,
}: ModalFooterProps) {
  const isLoading = (type: string) => actionLoading === type;
  const anyLoading = actionLoading !== null;
  const canClose = !isRcaIncomplete && !isEvidenceIncomplete && !anyLoading;

  return (
    <div className='sticky bottom-0 z-20 flex shrink-0 flex-col gap-2.5 border-t border-slate-100 bg-white px-5 py-4 pb-7'>
      {/* ── ON_PROGRESS ─────────────────────────────────────────────────── */}
      {isOnProgress && (
        <>
          {/* Requirement bar — hidden when all complete */}
          <RequirementBar
            photoCount={photoCount}
            photoRequired={photoRequired}
            isRcaIncomplete={isRcaIncomplete}
            isEvidenceIncomplete={isEvidenceIncomplete}
          />

          {/* Row 1: Update + Photo */}
          <div className='flex gap-2.5'>
            <ActionButton
              variant='primary'
              onClick={onUpdateClick}
              disabled={anyLoading}
              loading={isLoading('update')}
            >
              <svg
                className='h-3.5 w-3.5'
                viewBox='0 0 16 16'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.5'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M11.5 2.5a2 2 0 0 1 2.83 2.83L5 14.5H2v-3L11.5 2.5z' />
              </svg>
              Update Tiket
            </ActionButton>

            <PhotoButton
              onClick={onPhotoClick}
              photoCount={photoCount}
              photoRequired={photoRequired}
              disabled={anyLoading}
            />
          </div>

          {/* Row 2: Close — full width, full emphasis, largest element in footer */}
          <CloseButton
            canClose={canClose}
            loading={isLoading('close')}
            isEvidenceIncomplete={isEvidenceIncomplete}
            isRcaIncomplete={isRcaIncomplete}
            photoCount={photoCount}
            photoRequired={photoRequired}
            onClick={canClose ? onClose : undefined}
          />
        </>
      )}

      {/* ── ASSIGNED ────────────────────────────────────────────────────── */}
      {isAssigned && (
        <div className='flex flex-col gap-2'>
          {/* Context text */}
          <p className='text-center text-[11px] font-semibold text-slate-400'>
            Tiket ini telah di-assign ke Anda
          </p>

          {/* Big Pickup Button */}
          <button
            onClick={onPickup}
            disabled={anyLoading}
            className='flex h-[72px] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 hover:shadow-[0_8px_28px_rgba(99,102,241,0.45)] hover:-translate-y-0.5'
          >
            {anyLoading ? (
              <>
                <span className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
                <span className='text-[12px] font-bold tracking-wide opacity-80'>
                  Memproses...
                </span>
              </>
            ) : (
              <>
                <div className='flex items-center gap-2'>
                  <span className='text-xl'>🚀</span>
                  <span className='text-[18px] font-black tracking-wide'>
                    Pickup Ticket
                  </span>
                </div>
                <span className='text-[11px] font-semibold text-white/70'>
                  Mulai kerjakan tiket ini
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── PENDING ─────────────────────────────────────────────────────── */}
      {isPending && (
        <ActionButton
          variant='primary'
          onClick={onResume}
          disabled={anyLoading}
          loading={isLoading('resume')}
          className='w-full'
        >
          ▶️ Resume Ticket
        </ActionButton>
      )}

      {/* ── CLOSED ──────────────────────────────────────────────────────── */}
      {isClosed && (
        <div className='flex h-12.5 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-green-200 bg-green-50 text-[13.5px] font-black text-green-700'>
          <svg
            className='h-4 w-4'
            viewBox='0 0 16 16'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M13.5 4.5l-8 8L2 9' />
          </svg>
          Ticket Closed Successfully
        </div>
      )}
    </div>
  );
}

// ── Micro icon ────────────────────────────────────────────────────────────────
function InfoIcon() {
  return (
    <svg
      className='h-3.5 w-3.5 shrink-0'
      viewBox='0 0 16 16'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
    >
      <circle cx='8' cy='8' r='7' />
      <path d='M8 5v4M8 11v.5' />
    </svg>
  );
}
