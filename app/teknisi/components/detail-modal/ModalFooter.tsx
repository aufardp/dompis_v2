import React from 'react';
import {
  Camera,
  ClipboardCheck,
  ClipboardList,
  FileText,
  MapPin,
  PlayCircle,
  Rocket,
  Smartphone,
  UserPlus,
} from 'lucide-react';

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
    'flex items-center justify-center gap-2 rounded-2xl text-[13.5px] font-semibold tracking-[0.01em] transition-all active:scale-[0.97] disabled:cursor-not-allowed';

  const variants: Record<NonNullable<ActionButtonProps['variant']>, string> = {
    primary:
      'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md disabled:opacity-50',
    secondary:
      'border-[1.5px] border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2) disabled:opacity-50',
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

// ── CombinedActionButtons ─────────────────────────────────────────────────────

function CombinedActionButtons({
  canClose,
  loadingUpdate,
  loadingClose,
  onUpdate,
  onClose,
  isAlamatEmpty,
  isDeviceNameEmpty,
  isDetailPerbaikanEmpty,
  isEvidenceIncomplete,
  photoCount,
  photoRequired,
}: any) {
  const baseHeight = 'h-12'; // 48px minimum touch target

  // Logic untuk content tombol Close saat disabled
  const getCloseContent = () => {
    if (isAlamatEmpty) return { Icon: MapPin, main: 'Isi Alamat' };
    if (isDeviceNameEmpty) return { Icon: Smartphone, main: 'Isi Device' };
    if (isDetailPerbaikanEmpty) return { Icon: FileText, main: 'Isi Detail' };
    if (isEvidenceIncomplete)
      return { Icon: Camera, main: `Foto ${photoCount}/${photoRequired}` };
    return { Icon: ClipboardList, main: 'Isi RCA' };
  };

  const closeReason = getCloseContent();
  const CloseReasonIcon = closeReason.Icon;

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
        <span className='font-semibold'>Pending</span>
      </ActionButton>

      {/* Tombol Close */}
      <button
        onClick={canClose ? onClose : undefined}
        disabled={loadingClose || !canClose}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-all active:scale-[0.97] ${baseHeight} ${
          canClose
            ? 'bg-linear-to-br from-green-600 to-emerald-600 text-white shadow-md'
            : 'cursor-not-allowed border-[1.5px] border-(--border) bg-(--surface-2) text-(--text-tertiary)'
        }`}
      >
        {loadingClose ? (
          <span className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
        ) : (
          <>
            <span className={canClose ? '' : 'grayscale'}>
              {canClose ? <CheckIcon /> : <CloseReasonIcon size={18} />}
            </span>
            <span className='text-[13.5px] font-semibold'>
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
  isDeviceNameEmpty: boolean;
  isDetailPerbaikanEmpty: boolean;
  photoCount: number;
  photoRequired?: number;
  onUpdateClick: () => void;
  onPickup: () => void;
  onResume: () => void;
  onClose: () => void;
  onAddMember: () => void;
  onScrollToAlamat?: () => void;
  onScrollToDevice?: () => void;
  onScrollToRca?: () => void;
  onScrollToDetail?: () => void;
  onScrollToFoto?: () => void;
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
  isDeviceNameEmpty,
  isDetailPerbaikanEmpty,
  photoCount,
  photoRequired = 2,
  onUpdateClick,
  onPickup,
  onResume,
  onClose,
  onAddMember,
  onScrollToAlamat,
  onScrollToDevice,
  onScrollToRca,
  onScrollToDetail,
  onScrollToFoto,
}: ModalFooterProps) {
  const isLoading = (type: string) => actionLoading === type;
  const anyLoading = actionLoading !== null;
  const canClose =
    !isRcaIncomplete &&
    !isEvidenceIncomplete &&
    !isAlamatEmpty &&
    !isDeviceNameEmpty &&
    !isDetailPerbaikanEmpty &&
    !anyLoading;

  const pills = [
    {
      key: 'alamat',
      icon: MapPin,
      label: 'Alamat',
      ok: !isAlamatEmpty,
      onClick: onScrollToAlamat,
    },
    {
      key: 'device',
      icon: Smartphone,
      label: 'Device',
      ok: !isDeviceNameEmpty,
      onClick: onScrollToDevice,
    },
    {
      key: 'rca',
      icon: ClipboardCheck,
      label: 'RCA',
      ok: !isRcaIncomplete,
      onClick: onScrollToRca,
    },
    {
      key: 'detail',
      icon: FileText,
      label: 'Detail',
      ok: !isDetailPerbaikanEmpty,
      onClick: onScrollToDetail,
    },
    {
      key: 'foto',
      icon: Camera,
      label: `Foto ${photoCount}/${photoRequired}`,
      ok: photoCount >= photoRequired,
      onClick: onScrollToFoto,
    },
  ];

  return (
    <div
      className='flex shrink-0 flex-col gap-3 border-t border-(--border) bg-(--surface) px-4 pt-3'
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {isOnProgress && (
      <div className='flex items-center justify-between gap-1'>
        {pills.map((pill) => {
          const Icon = pill.icon;
          return (
            <button
              key={pill.key}
              type='button'
              onClick={pill.onClick}
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors',
                pill.ok
                  ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                  : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
                pill.onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
              ].join(' ')}
            >
              <Icon size={11} />
              {pill.label}
            </button>
          );
        })}
      </div>
      )}

      {isOnProgress && (
        <>
          {/* Add Member button */}
          <button
            onClick={onAddMember}
            disabled={actionLoading !== null}
            className='flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
          >
            <UserPlus size={14} />
            Undang Teman
          </button>

          <CombinedActionButtons
            canClose={canClose}
            loadingUpdate={isLoading('update')}
            loadingClose={isLoading('close')}
            onUpdate={onUpdateClick}
            onClose={onClose}
            isAlamatEmpty={isAlamatEmpty}
            isDeviceNameEmpty={isDeviceNameEmpty}
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
          className='flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-semibold text-white'
        >
          {isLoading('pickup') ? (
            'Processing...'
          ) : (
            <>
              <Rocket size={16} className='inline -mt-0.5 mr-1.5' />
              Pickup Ticket
            </>
          )}
        </button>
      )}

      {isPending && (
        <button
          onClick={onResume}
          disabled={anyLoading}
          className='flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 font-semibold text-white'
        >
          {isLoading('resume') ? (
            'Processing...'
          ) : (
            <>
              <PlayCircle size={16} className='inline -mt-0.5 mr-1.5' />
              Resume Ticket
            </>
          )}
        </button>
      )}

      {isClosed && (
        <div className='flex h-14 items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 font-semibold text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400'>
          <CheckIcon className='h-4 w-4' /> Ticket Closed
        </div>
      )}
    </div>
  );
}
