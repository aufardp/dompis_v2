import React from 'react';

// ── Icons ────────────────────────────────────────────────────────────────────

const PendingIcon = () => (
  <svg
    className='h-4 w-4'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='2.5'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <circle cx='12' cy='12' r='10' />
    <polyline points='12 6 12 12 16 14' />
  </svg>
);

const CheckIcon = ({ className = 'h-5 w-5' }) => (
  <svg
    className={className}
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='2.8'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <path d='M13.5 4.5l-8 8L2 9' />
  </svg>
);

// ── ActionButton (Generic) ───────────────────────────────────────────────────

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success';
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
    'flex items-center justify-center gap-2 rounded-2xl text-[13.5px] font-black tracking-[0.01em] transition-all active:scale-[0.97] disabled:cursor-not-allowed';

  const variants: Record<NonNullable<ActionButtonProps['variant']>, string> = {
    primary:
      'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md disabled:opacity-50',
    secondary:
      'border-[1.5px] border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50',
    success:
      'bg-gradient-to-br from-green-600 to-emerald-600 text-white shadow-md disabled:opacity-50',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? (
        <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
      ) : (
        children
      )}
    </button>
  );
}

// ── RequirementBar ────────────────────────────────────────────────────────────

function RequirementBar({
  photoCount,
  photoRequired,
  isRcaIncomplete,
  isEvidenceIncomplete,
  isAlamatEmpty,
  isDetailPerbaikanEmpty,
}: any) {
  const photoOk = !isEvidenceIncomplete && photoCount >= photoRequired;
  const rcaOk = !isRcaIncomplete;
  const alamatOk = !isAlamatEmpty;
  const detailOk = !isDetailPerbaikanEmpty;

  if (photoOk && rcaOk && alamatOk && detailOk) return null;

  const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
        ok
          ? 'border-green-200 bg-green-50 text-green-600'
          : 'border-red-100 bg-red-50 text-red-500'
      }`}
    >
      {ok ? '✓' : '⚠'} {label}
    </span>
  );

  return (
    <div className='flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2'>
      <span className='flex-1 text-[11px] font-bold text-slate-500'>
        Syarat Close:
      </span>
      <div className='flex flex-wrap justify-end gap-1.5'>
        <Badge ok={alamatOk} label='Alamat' />
        <Badge ok={rcaOk} label='RCA' />
        <Badge ok={detailOk} label='Detail' />
        <Badge ok={photoOk} label={`Foto ${photoCount}/${photoRequired}`} />
      </div>
    </div>
  );
}

// ── CombinedActionButtons ─────────────────────────────────────────────────────

function CombinedActionButtons({
  canClose,
  loadingUpdate,
  loadingClose,
  onUpdate,
  onClose,
  isAlamatEmpty,
  isDetailPerbaikanEmpty,
  isEvidenceIncomplete,
  photoCount,
  photoRequired,
}: any) {
  const baseHeight = 'h-12'; // 48px minimum touch target

  // Logic untuk content tombol Close saat disabled
  const getCloseContent = () => {
    if (isAlamatEmpty) return { icon: '📍', main: 'Isi Alamat' };
    if (isDetailPerbaikanEmpty) return { icon: '📝', main: 'Isi Detail' };
    if (isEvidenceIncomplete)
      return { icon: '📷', main: `Foto ${photoCount}/${photoRequired}` };
    return { icon: '📋', main: 'Isi RCA' };
  };

  const closeReason = getCloseContent();

  return (
    <div className='flex w-full gap-2.5'>
      {/* Tombol Pending */}
      <ActionButton
        variant='secondary'
        onClick={onUpdate}
        loading={loadingUpdate}
        className={`${baseHeight} flex-1 flex-col gap-0.5!`}
      >
        <PendingIcon />
        <span className='font-black'>Pending</span>
      </ActionButton>

      {/* Tombol Close */}
      <button
        onClick={canClose ? onClose : undefined}
        disabled={loadingClose || (!canClose && false)}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-all active:scale-[0.97] ${baseHeight} ${
          canClose
            ? 'bg-linear-to-br from-green-600 to-emerald-600 text-white shadow-md'
            : 'cursor-not-allowed border-[1.5px] border-slate-200 bg-slate-50 text-slate-400'
        }`}
      >
        {loadingClose ? (
          <span className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
        ) : (
          <>
            <span className={canClose ? '' : 'grayscale'}>
              {canClose ? <CheckIcon /> : closeReason.icon}
            </span>
            <span className='text-[13.5px] font-black'>
              {canClose ? 'Close Tiket' : closeReason.main}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

// ── ModalFooter (MAIN) ────────────────────────────────────────────────────────

interface ModalFooterProps {
  isOnProgress: boolean;
  isAssigned: boolean;
  isPending: boolean;
  isClosed: boolean;
  actionLoading: string | null;
  isRcaIncomplete: boolean;
  isEvidenceIncomplete: boolean;
  isAlamatEmpty: boolean;
  isDetailPerbaikanEmpty: boolean;
  photoCount: number;
  photoRequired?: number;
  onUpdateClick: () => void;
  onPickup: () => void;
  onResume: () => void;
  onClose: () => void;
}

export default function ModalFooter({
  isOnProgress,
  isAssigned,
  isPending,
  isClosed,
  actionLoading,
  isRcaIncomplete,
  isEvidenceIncomplete,
  isAlamatEmpty,
  isDetailPerbaikanEmpty,
  photoCount,
  photoRequired = 2,
  onUpdateClick,
  onPickup,
  onResume,
  onClose,
}: ModalFooterProps) {
  const isLoading = (type: string) => actionLoading === type;
  const anyLoading = actionLoading !== null;
  const canClose =
    !isRcaIncomplete &&
    !isEvidenceIncomplete &&
    !isAlamatEmpty &&
    !isDetailPerbaikanEmpty &&
    !anyLoading;

  return (
    <div
      className='shrink-0 flex flex-col gap-3 border-t border-slate-100 bg-white px-4 pt-3'
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {isOnProgress && (
        <>
          <RequirementBar
            photoCount={photoCount}
            photoRequired={photoRequired}
            isRcaIncomplete={isRcaIncomplete}
            isAlamatEmpty={isAlamatEmpty}
            isDetailPerbaikanEmpty={isDetailPerbaikanEmpty}
            isEvidenceIncomplete={isEvidenceIncomplete}
          />
          <CombinedActionButtons
            canClose={canClose}
            loadingUpdate={isLoading('update')}
            loadingClose={isLoading('close')}
            onUpdate={onUpdateClick}
            onClose={onClose}
            isAlamatEmpty={isAlamatEmpty}
            isDetailPerbaikanEmpty={isDetailPerbaikanEmpty}
            isEvidenceIncomplete={isEvidenceIncomplete}
            photoCount={photoCount}
            photoRequired={photoRequired}
          />
        </>
      )}

      {/* State lainnya (Assigned/Pending) tetap menggunakan full width button untuk UX yang jelas */}
      {isAssigned && (
        <button
          onClick={onPickup}
          disabled={anyLoading}
          className='flex h-12 w-full flex-col items-center justify-center rounded-2xl bg-blue-600 font-black text-white'
        >
          {isLoading('pickup') ? 'Processing...' : '🚀 Pickup Ticket'}
        </button>
      )}

      {isPending && (
        <button
          onClick={onResume}
          disabled={anyLoading}
          className='flex h-12 w-full flex-col items-center justify-center rounded-2xl bg-purple-600 font-black text-white'
        >
          {isLoading('resume') ? 'Processing...' : '▶️ Resume Ticket'}
        </button>
      )}

      {isClosed && (
        <div className='flex h-14 items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 font-black text-green-700'>
          <CheckIcon className='h-4 w-4' /> Ticket Closed
        </div>
      )}
    </div>
  );
}
