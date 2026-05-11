'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  User,
  Phone,
  MapPin,
  Wrench,
  Clock,
  AlertTriangle,
  Calendar,
  UserCircle,
  Activity,
  Settings,
  ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  CustomerType,
  type TicketCtype,
  type TicketVisitStatus,
} from '@/app/types/ticket';
import { getEffectiveMaxTtrISO } from '@/app/libs/tickets/effective';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { normalizeCustomerType } from '@/app/config/customer-types';
import EvidenceGallery from './EvidenceGallery';

type TicketStatusKey =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'CANCELLED'
  | 'CLOSE'
  | 'CLOSED';

interface TicketDetail {
  idTicket: number;
  ticket: string;
  summary: string;
  reportedDate: string;
  ownerGroup?: string;
  serviceType?: string;
  customerType?: string;
  ctype?: TicketCtype;
  customerSegment?: string;
  serviceNo: string;
  contactName: string;
  contactPhone: string;
  deviceName?: string;
  symptom?: string;
  workzone?: string;
  alamat?: string | null;
  status: string;
  hasilVisit?: TicketVisitStatus | null;
  bookingDate?: string;
  sourceTicket?: string;
  jenisTiket?: string;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  pendingReason?: string | null;
  rca?: string | null;
  subRca?: string | null;
  teknisiUserId?: number | null;
  technicianName?: string | null;
  closedAt?: string | null;
  statusUpdate?: string | null;
  STATUS_UPDATE?: string | null;
  tracking?: {
    assignedAt: string | null;
    assignedBy: string | null;
    assignedTo: string | null;
    pickedUpAt: string | null;
    onProgressAt: string | null;
    pendingAt: string | null;
    closedAt: string | null;
    pendingReason: string | null;
  } | null;
  activityLog?: Array<{
    id: number;
    type: string;
    description: string | null;
    userName: string | null;
    roleId: number;
    createdAt: string;
  }>;
  assignmentHistory?: Array<{
    id: number;
    assignerName: string | null;
    technicianName: string | null;
    assignedAt: string;
    unassignedAt: string | null;
    isActive: boolean;
  }>;
}

interface TicketDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  ticket: TicketDetail | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEdit?: (ticket: TicketDetail) => void;
  onUpdateStatus?: (ticket: TicketDetail) => void;
}

const CTYPE_BORDER: Record<TicketCtype, string> = {
  REGULER: 'border-slate-200',
  HVC_GOLD: 'border-amber-200',
  HVC_PLATINUM: 'border-indigo-200',
  HVC_DIAMOND: 'border-sky-200',
};

const STATUS_CONFIG: Record<
  TicketStatusKey | string,
  {
    label: string;
    color: string;
    bg: string;
    dot: string;
    icon?: string;
    border?: string;
  }
> = {
  OPEN: {
    label: 'Open',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
    border: 'border-blue-200',
    // icon: '📂',
  },
  ASSIGNED: {
    label: 'Assigned',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    dot: 'bg-indigo-500',
    border: 'border-indigo-200',
    // icon: '👤',
  },
  ON_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    // icon: '⚙️',
  },
  IN_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    // icon: '⚙️',
  },
  PENDING: {
    label: 'Pending',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
    // icon: '⏸',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
    border: 'border-red-200',
    // icon: '❌',
  },
  CLOSE: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    border: 'border-green-200',
    // icon: '✅',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    border: 'border-green-200',
    // icon: '✅',
  },
};

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function formatShortDistance(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNowStrict(new Date(dateStr), {
      addSuffix: true,
      locale: id,
    });
  } catch {
    return '—';
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: id });
  } catch {
    return '—';
  }
}

function pickTtrDeadline(ticket: TicketDetail | null): string | null {
  return getEffectiveMaxTtrISO(ticket);
}

function formatTtrDelta(deadline: string | null | undefined): string {
  if (!deadline) return '—';
  try {
    const d = new Date(deadline);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const hours = Math.floor(absMs / (1000 * 60 * 60));
    const mins = Math.floor((absMs - hours * 3600_000) / 60_000);
    const hh = `${hours}h${mins ? ` ${mins}m` : ''}`;
    return diffMs < 0 ? `Overdue ${hh}` : `Due in ${hh}`;
  } catch {
    return '—';
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd MMMM yyyy', { locale: id });
  } catch {
    return '—';
  }
}

interface BadgeProps {
  label: string;
  color: string;
  bg: string;
  dot?: string;
  icon?: string;
}

function StatusBadge({
  label,
  color,
  bg,
  dot,
  icon,
  border,
}: BadgeProps & { border?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm',
        bg,
        color,
        border || 'border-opacity-20',
      )}
    >
      {dot && <span className={clsx('h-2 w-2 rounded-full', dot)} />}
      {icon && <span className='text-sm'>{icon}</span>}
      {label}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type='button'
      onClick={onCopy}
      className='inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
      title={label}
      aria-label={label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CTypeBadge({ ctype }: { ctype?: TicketCtype }) {
  if (!ctype || !CustomerType[ctype]) {
    return <span className='text-slate-400'>—</span>;
  }
  const config = CustomerType[ctype];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        config.bg,
        config.color,
        CTYPE_BORDER[ctype],
      )}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  fullWidth?: boolean;
  highlight?: boolean;
}

function Field({ label, value, mono, fullWidth, highlight }: FieldProps) {
  const displayValue = value ?? '—';
  return (
    <div className={clsx(fullWidth ? 'col-span-2' : '')}>
      <p className='mb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
        {label}
      </p>
      <p
        className={clsx(
          'text-[13.5px] wrap-break-word',
          mono && 'font-mono',
          highlight ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300',
        )}
      >
        {displayValue}
      </p>
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  fullWidth?: boolean;
  variant?: 'default' | 'highlighted';
}

function Section({
  icon,
  title,
  children,
  fullWidth,
  variant = 'default',
}: SectionProps) {
  return (
    <div
      className={clsx(
        'mb-5 rounded-xl border bg-gray p-4  border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm',
        variant === 'highlighted'
          ? 'border-slate-300 dark:border-slate-600 shadow-md'
          : 'border-slate-200 dark:border-slate-700 shadow-sm',
        fullWidth ? '' : 'grid grid-cols-2 gap-x-4 gap-y-3',
      )}
    >
      <div
        className={clsx(fullWidth ? 'grid grid-cols-2 gap-x-4' : 'col-span-2')}
      >
        <div className='col-span-2 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-700'>
          <span className='text-slate-500'>{icon}</span>
          <h3 className='text-xs font-semibold tracking-wider text-slate-700 uppercase dark:text-slate-300'>
            {title}
          </h3>
        </div>
        {children}
      </div>
    </div>
  );
}

interface TTRCardProps {
  label: string;
  value: string | null | undefined;
}

function getTTRUrgency(
  ttrValue: string | null | undefined,
): 'overdue' | 'warning' | 'safe' | 'unknown' {
  if (!ttrValue) return 'unknown';
  try {
    const ttrDate = new Date(ttrValue);
    const now = new Date();
    const hoursRemaining =
      (ttrDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursRemaining < 0) return 'overdue';
    if (hoursRemaining < 3) return 'warning';
    return 'safe';
  } catch {
    return 'unknown';
  }
}

function TTRCard({ label, value }: TTRCardProps) {
  const urgency = getTTRUrgency(value);

  const styles = {
    overdue: 'border-red-300 dark:border-red-500/40 bg-gradient-to-br from-red-50 dark:from-red-500/15 to-red-100 dark:to-red-500/10',
    warning: 'border-amber-300 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 dark:from-amber-500/15 to-amber-100 dark:to-amber-500/10',
    safe: 'border-green-300 dark:border-green-500/40 bg-gradient-to-br from-green-50 dark:from-green-500/15 to-green-100 dark:to-green-500/10',
    unknown: 'border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 dark:from-slate-800 to-slate-100 dark:to-slate-700',
  };

  const textStyles = {
    overdue: 'text-red-700 dark:text-red-400',
    warning: 'text-amber-700 dark:text-amber-400',
    safe: 'text-green-700 dark:text-green-400',
    unknown: 'text-slate-500 dark:text-slate-400',
  };

  return (
    <div className={clsx('rounded-xl border p-3 shadow-sm', styles[urgency])}>
      <p className='mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase'>
        {label}
      </p>
      <p className={clsx('text-sm font-semibold', textStyles[urgency])}>
        {value ? formatDateTime(value) : '—'}
      </p>
    </div>
  );
}

interface TimelineEvent {
  time: string;
  label: string;
  detail: string;
  icon: string;
  color: string;
}

function TrackingTimeline({ ticket }: { ticket: TicketDetail }) {
  const tracking = ticket.tracking;
  const activityLog = ticket.activityLog ?? [];
  const assignmentHistory = ticket.assignmentHistory ?? [];

  const timelineEvents: TimelineEvent[] = [];

  if (tracking?.assignedAt) {
    timelineEvents.push({
      time: tracking.assignedAt,
      label: 'Tiket Di-assign',
      detail: `Oleh: ${tracking.assignedBy ?? '—'} → ${tracking.assignedTo ?? '—'}`,
      icon: '📋',
      color: 'blue',
    });
  }

  if (tracking?.pickedUpAt) {
    timelineEvents.push({
      time: tracking.pickedUpAt,
      label: 'Tiket Diambil (Pickup)',
      detail: tracking.assignedTo ?? '—',
      icon: '🤚',
      color: 'indigo',
    });
  }

  if (tracking?.onProgressAt) {
    timelineEvents.push({
      time: tracking.onProgressAt,
      label: 'Mulai Dikerjakan',
      detail: tracking.assignedTo ?? '—',
      icon: '🔧',
      color: 'amber',
    });
  }

  if (tracking?.pendingAt) {
    timelineEvents.push({
      time: tracking.pendingAt,
      label: 'Pending',
      detail: tracking.pendingReason ?? '—',
      icon: '⏸️',
      color: 'orange',
    });
  }

  if (tracking?.closedAt) {
    timelineEvents.push({
      time: tracking.closedAt,
      label: 'Tiket Ditutup',
      detail: tracking.assignedTo ?? '—',
      icon: '✅',
      color: 'emerald',
    });
  }

  timelineEvents.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  return (
    <div className='space-y-6 p-4'>
      {/* Milestone Timeline */}
      <div>
        <div className='mb-3 flex items-center gap-2'>
          <ClipboardList size={14} className='text-slate-400' />
          <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Milestone
          </p>
        </div>
        {timelineEvents.length === 0 ? (
          <p className='text-sm text-slate-400'>Belum ada data tracking</p>
        ) : (
          <div className='relative ml-3 space-y-0'>
            <div className='absolute top-2 bottom-2 left-0 w-px bg-slate-200 dark:bg-slate-700' />
            {timelineEvents.map((event, idx) => (
              <div key={idx} className='relative flex gap-4 pb-5'>
                <div
                  className={clsx(
                    'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-white shadow-sm',
                    event.color === 'emerald'
                      ? 'bg-emerald-500'
                      : event.color === 'blue'
                        ? 'bg-blue-500'
                        : event.color === 'amber'
                          ? 'bg-amber-500'
                          : event.color === 'orange'
                            ? 'bg-orange-500'
                            : 'bg-indigo-500',
                  )}
                >
                  <span>{event.icon}</span>
                </div>
                <div className='min-w-0 flex-1 pt-0.5'>
                  <p className='text-xs font-semibold text-slate-700 dark:text-slate-200'>
                    {event.label}
                  </p>
                  <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                    {event.detail}
                  </p>
                  <p className='mt-0.5 text-[10px] text-slate-400 dark:text-slate-500'>
                    {format(new Date(event.time), 'dd MMM yyyy, HH:mm', {
                      locale: id,
                    })}
                    {' · '}
                    <span className='text-slate-400'>
                      {formatDistanceToNowStrict(new Date(event.time), {
                        addSuffix: true,
                        locale: id,
                      })}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Riwayat Assign */}
      {assignmentHistory.length > 0 && (
        <div>
          <p className='mb-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Riwayat Assign
          </p>
          <div className='space-y-2'>
            {assignmentHistory.map((h) => (
              <div
                key={h.id}
                className={clsx(
                  'rounded-lg border p-3 text-xs',
                  h.isActive
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
                )}
              >
                <div className='flex items-start justify-between'>
                  <div>
                    <span className='font-medium text-slate-700 dark:text-slate-200'>
                      {h.technicianName ?? '—'}
                    </span>
                    {h.isActive && (
                      <span className='ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'>
                        Aktif
                      </span>
                    )}
                    <p className='mt-0.5 text-slate-500'>
                      Di-assign oleh: {h.assignerName ?? 'Sistem'}
                    </p>
                  </div>
                  <div className='text-right text-[10px] text-slate-400'>
                    <p>
                      {format(new Date(h.assignedAt), 'dd MMM yyyy, HH:mm', {
                        locale: id,
                      })}
                    </p>
                    {h.unassignedAt && (
                      <p className='mt-0.5 text-slate-400'>
                        s/d{' '}
                        {format(new Date(h.unassignedAt), 'dd MMM, HH:mm', {
                          locale: id,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      {activityLog.length > 0 && (
        <div>
          <p className='mb-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Log Aktivitas
          </p>
          <div className='space-y-2'>
            {activityLog.map((log) => (
              <div key={log.id} className='flex items-start gap-3 text-xs'>
                <span className='mt-0.5 shrink-0 text-[10px] text-slate-400'>
                  {format(new Date(log.createdAt), 'HH:mm', { locale: id })}
                </span>
                <div className='min-w-0 flex-1'>
                  <span className='font-medium text-slate-700 dark:text-slate-200'>
                    {log.userName ?? 'Sistem'}
                  </span>
                  <span className='mx-1 text-slate-400'>·</span>
                  <span className='text-slate-500 dark:text-slate-400'>
                    {log.description ?? log.type}
                  </span>
                  <p className='mt-0.5 text-[10px] text-slate-400'>
                    {format(new Date(log.createdAt), 'dd MMM yyyy', {
                      locale: id,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TicketDetailDrawer({
  open,
  onClose,
  ticket,
  loading = false,
  error = null,
  onRetry,
  onEdit,
  onUpdateStatus,
}: TicketDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<
    'umum' | 'customer' | 'teknis' | 'sla' | 'tracking'
  >('umum');
  const [isVisible, setIsVisible] = useState(false);
  const [evidence, setEvidence] = useState<
    Array<{
      id: number;
      fileName: string;
      filePath: string;
      url: string;
      driveUrl: string | null;
    }>
  >([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (open) setActiveTab('umum');
  }, [open, ticket?.idTicket]);

  useEffect(() => {
    if (open) {
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [open]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const ttrDeadline = useMemo(() => pickTtrDeadline(ticket), [ticket]);
  const ttrUrgency = getTTRUrgency(ttrDeadline);
  const ttrLabel = formatTtrDelta(ttrDeadline);

  useEffect(() => {
    if (!open || !ticket?.idTicket) {
      setEvidence([]);
      setEvidenceLoading(false);
      return;
    }

    const statusRaw = String(
      ticket.STATUS_UPDATE ??
        ticket.statusUpdate ??
        ticket.hasilVisit ??
        ticket.status ??
        '',
    )
      .toLowerCase()
      .trim();
    const shouldFetchEvidence =
      statusRaw.includes('close') || statusRaw.includes('pending');
    if (!shouldFetchEvidence) {
      setEvidence([]);
      setEvidenceLoading(false);
      return;
    }

    let cancelled = false;
    setEvidenceLoading(true);
    fetchWithAuth(`/api/tickets/${ticket.idTicket}/evidence`)
      .then((r) => (r ? r.json().catch(() => null) : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.success) setEvidence(d.data ?? []);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (cancelled) return;
        setEvidenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    ticket?.idTicket,
    ticket?.STATUS_UPDATE,
    ticket?.statusUpdate,
    ticket?.hasilVisit,
    ticket?.status,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open && !isVisible) return null;

  const tabs = [
    { key: 'umum', label: 'Umum' },
    { key: 'customer', label: 'Customer' },
    { key: 'teknis', label: 'Teknis' },
    { key: 'sla', label: 'SLA' },
    { key: 'tracking', label: 'Tracking' },
  ] as const;

  const rawStatus =
    ticket?.STATUS_UPDATE ??
    ticket?.statusUpdate ??
    ticket?.hasilVisit ??
    ticket?.status ??
    '';
  const workflowKey = normalizeKey(rawStatus);
  const workflowConfig = STATUS_CONFIG[workflowKey] || {
    label: workflowKey || '—',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    dot: 'bg-slate-500',
  };

  const content = (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex justify-end transition-all duration-300 ease-out',
        isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent',
      )}
      onClick={handleClose}
    >
      <div
        className={clsx(
          'flex h-full w-full max-w-130 transform flex-col bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-300 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {ticket ? (
          <>
            <div className='sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-base font-bold text-slate-900 dark:text-white'>
                    {ticket.ticket}
                  </span>
                  <div className='flex shrink-0 items-center gap-2'>
                    <CopyButton text={ticket.ticket} label='Copy ticket code' />
                  </div>
                  <StatusBadge {...workflowConfig} />
                  <CTypeBadge ctype={ticket.ctype} />
                </div>
                <button
                  onClick={handleClose}
                  className='rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                >
                  <X size={20} />
                </button>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-slate-500 '>
                    {ticket.contactName || '—'}
                  </p>
                  <p className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500'>
                    <span className='font-mono'>{ticket.serviceNo || '—'}</span>
                    <span className='hidden sm:inline'>•</span>
                    <span className='truncate'>{ticket.workzone || '—'}</span>
                    {ticket.serviceNo && (
                      <CopyButton
                        text={ticket.serviceNo}
                        label='Copy service number'
                      />
                    )}
                  </p>
                </div>
              </div>

              {/* PENDING REASON BANNER */}
              {ticket.hasilVisit === 'PENDING' && ticket.pendingReason && (
                <div className='mt-3 rounded-xl border-2 border-purple-200 bg-purple-50 p-4 shadow-sm'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100'>
                      <AlertTriangle size={18} className='text-purple-600' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='text-sm font-bold text-purple-900'>
                        ⏸ Ticket Pending
                      </h4>
                      <p className='mt-1 text-sm text-purple-800'>
                        {ticket.pendingReason}
                      </p>
                      {ticket.closedAt && (
                        <p className='mt-2 text-xs text-purple-600'>
                          Closed: {formatDateTime(ticket.closedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className='mt-3 flex border-b border-slate-200 dark:border-slate-700'>
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={clsx(
                      'relative px-4 py-2.5 text-xs font-medium transition-colors',
                      activeTab === tab.key
                        ? 'font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <span className='absolute right-0 bottom-0 left-0 h-0.5 bg-slate-900 dark:bg-white' />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 px-5 py-4'>
              {activeTab === 'umum' && (
                <>
                  <div
                    className={clsx(
                      'mb-5 rounded-xl border-2 bg-linear-to-br p-5 shadow-md',
                      ttrUrgency === 'overdue'
                        ? 'border-red-300 dark:border-red-500/40 from-red-50 dark:from-red-500/15 to-red-100 dark:to-red-500/10'
                        : ttrUrgency === 'warning'
                          ? 'border-amber-300 dark:border-amber-500/40 from-amber-50 dark:from-amber-500/15 to-amber-100 dark:to-amber-500/10'
                          : 'border-slate-200 dark:border-slate-700 from-slate-50 dark:from-slate-800 to-slate-100 dark:to-slate-700',
                    )}
                  >
                    <div className='flex items-start justify-between gap-4'>
                      <div>
                        <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                          SLA / TTR
                        </p>
                        <p
                          className={clsx(
                            'mt-1.5 text-base font-bold',
                            ttrUrgency === 'overdue'
                              ? 'text-red-500'
                              : ttrUrgency === 'warning'
                                ? 'text-amber-700'
                                : 'text-slate-700',
                          )}
                        >
                          {ttrLabel}
                        </p>
                        <p className='mt-1 text-xs text-slate-500'>
                          Deadline:{' '}
                          {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
                        </p>
                      </div>

                      <div className='text-right'>
                        <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
                          Reported
                        </p>
                        <p className='mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200'>
                          {formatShortDistance(ticket.reportedDate)}
                        </p>
                        <p className='mt-1 text-xs text-slate-500'>
                          {formatDateTime(ticket.reportedDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm'>
                    <p className='mb-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase'>
                      Summary
                    </p>
                    <p className='text-sm leading-relaxed text-slate-700 dark:text-slate-300'>
                      {ticket.summary}
                    </p>
                  </div>

                  <Section
                    icon={<Activity size={14} />}
                    title='Informasi Tiket'
                    variant='highlighted'
                  >
                    <Field label='Ticket' value={ticket.ticket} mono />
                    <Field
                      label='Reported Date'
                      value={formatDateTime(ticket.reportedDate)}
                    />
                    <Field label='Source Ticket' value={ticket.sourceTicket} />
                    <Field label='Jenis Tiket' value={ticket.jenisTiket} />
                    <Field label='Owner Group' value={ticket.ownerGroup} />
                    <Field
                      label='Booking Date'
                      value={formatDateTime(ticket.bookingDate)}
                    />
                  </Section>

                  <Section icon={<Settings size={14} />} title='Status & Hasil'>
                    <Field label='STATUS_UPDATE' value={workflowConfig.label} />
                    {ticket.status && ticket.status !== workflowKey && (
                      <Field label='STATUS' value={ticket.status} />
                    )}
                    {ticket.closedAt && (
                      <Field
                        label='Closed At'
                        value={formatDateTime(ticket.closedAt)}
                      />
                    )}
                  </Section>
                </>
              )}

              {activeTab === 'customer' && (
                <>
                  <Section
                    icon={<User size={14} />}
                    title='Kontak Pelanggan'
                    fullWidth
                  >
                    <div className='col-span-2'>
                      <Field
                        label='Contact Name'
                        value={ticket.contactName}
                        fullWidth
                      />
                    </div>
                    <Field label='Service No' value={ticket.serviceNo} mono />
                    <Field
                      label='Contact Phone'
                      value={ticket.contactPhone}
                      mono
                    />
                    {ticket.contactPhone && (
                      <div className='col-span-2 mt-1 flex flex-wrap gap-2'>
                        <a
                          href={`tel:${ticket.contactPhone}`}
                          className='inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        >
                          <Phone size={14} />
                          Call
                        </a>
                      </div>
                    )}
                  </Section>

                  <Section icon={<UserCircle size={14} />} title='Segmentasi'>
                    {ticket.customerType ? (
                      (() => {
                        const resolvedCtype = ticket.ctype
                          ? ticket.ctype
                          : normalizeCustomerType(ticket.customerType);
                        const config = resolvedCtype
                          ? CustomerType[resolvedCtype]
                          : null;
                        return (
                          <div className='col-span-2'>
                            <div className='mb-1.5 text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400'>
                              Tipe Pelanggan
                            </div>
                            {config ? (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.color}`}
                              >
                                <span>{config.icon}</span>
                                <span>{config.label}</span>
                              </span>
                            ) : (
                              <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                                {ticket.customerType}
                              </span>
                            )}
                          </div>
                        );
                      })()
                    ) : null}
                    <Field
                      label='Customer Segment'
                      value={ticket.customerSegment}
                    />
                    <Field label='Service Type' value={ticket.serviceType} />
                  </Section>

                  {(ticket.alamat || ticket.workzone) && (
                    <Section
                      icon={<MapPin size={14} />}
                      title='Lokasi'
                      fullWidth
                    >
                      <div className='col-span-2'>
                        <Field label='Alamat' value={ticket.alamat} fullWidth />
                      </div>
                      <div className='col-span-2'>
                        <Field
                          label='Workzone'
                          value={ticket.workzone}
                          fullWidth
                        />
                      </div>
                    </Section>
                  )}
                </>
              )}

              {activeTab === 'teknis' && (
                <>
                  <Section
                    icon={<Wrench size={14} />}
                    title='Perangkat & Gejala'
                  >
                    <Field label='Device Name' value={ticket.deviceName} />
                    <Field label='Symptom' value={ticket.symptom} />
                  </Section>

                  <Section
                    icon={<AlertTriangle size={14} />}
                    title='Root Cause Analysis'
                    fullWidth
                  >
                    <div className='col-span-2'>
                      <Field label='RCA' value={ticket.rca} fullWidth />
                    </div>
                    <div className='col-span-2'>
                      <Field label='Sub RCA' value={ticket.subRca} fullWidth />
                    </div>
                  </Section>

                  {(() => {
                    const statusRaw = String(
                      ticket?.STATUS_UPDATE ??
                        ticket?.statusUpdate ??
                        ticket?.hasilVisit ??
                        ticket?.status ??
                        '',
                    )
                      .toLowerCase()
                      .trim();
                    const isClosed = statusRaw.includes('close');
                    if (!isClosed) return null;

                    const isPending =
                      statusRaw.includes('pending') &&
                      !statusRaw.includes('close');
                    return (
                      <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
                        <div className='mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-700'>
                          <span className='text-slate-500'>📷</span>
                          <h3 className='text-xs font-semibold tracking-wider text-slate-700 uppercase dark:text-slate-300'>
                            Evidence Foto
                          </h3>
                          {isPending && (
                            <span className='ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'>
                              Pending
                            </span>
                          )}
                          {evidence.length > 0 && (
                            <span className='ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400'>
                              {evidence.length} foto
                            </span>
                          )}
                        </div>

                        {evidenceLoading ? (
                          <div className='flex items-center gap-2 py-4 text-sm text-slate-400'>
                            <div className='h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500' />
                            Memuat evidence...
                          </div>
                        ) : evidence.length === 0 ? (
                          <p className='py-2 text-sm text-slate-400'>
                            Tidak ada evidence foto
                          </p>
                        ) : (
                          <div className='grid grid-cols-2 gap-2'>
                            {evidence.map((e, idx) => {
                              const imageUrl = e.driveUrl ?? e.url;
                              return (
                                <button
                                  key={e.id}
                                  type='button'
                                  onClick={() => {
                                    setGalleryIndex(idx);
                                    setGalleryOpen(true);
                                  }}
                                  className='group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left'
                                >
                                  <img
                                    src={imageUrl}
                                    alt={e.fileName}
                                    className='h-full w-full object-cover transition-opacity group-hover:opacity-80'
                                    onError={(el) => {
                                      const img = el.target as HTMLImageElement;
                                      if (!img.dataset.fallback) {
                                        img.dataset.fallback = '1';
                                        img.src = '/assets/logo.webp';
                                      }
                                    }}
                                  />
                                  <div className='absolute right-0 bottom-0 left-0 bg-black/50 px-2 py-1'>
                                    <p className='truncate text-[10px] text-white'>
                                      {e.fileName}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {galleryOpen && (
                    <EvidenceGallery
                      items={evidence}
                      initialIndex={galleryIndex}
                      onClose={() => setGalleryOpen(false)}
                    />
                  )}

                  <Section icon={<UserCircle size={14} />} title='Teknisi'>
                    <Field
                      label='Technician Name'
                      value={ticket.technicianName}
                    />
                    <Field
                      label='Technician ID'
                      value={
                        ticket.teknisiUserId
                          ? `#${ticket.teknisiUserId}`
                          : undefined
                      }
                      mono
                    />
                  </Section>
                </>
              )}

              {activeTab === 'sla' && (
                <>
                  <div className='mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase'>
                          SLA / TTR
                        </p>
                        <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>
                          {ttrLabel}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>
                          Deadline:{' '}
                          {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
                        </p>
                      </div>
                      <div className='text-right'>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase'>
                          Closed
                        </p>
                        <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>
                          {ticket.closedAt
                            ? formatShortDistance(ticket.closedAt)
                            : '—'}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>
                          {formatDateTime(ticket.closedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='mb-5'>
                    <div className='mb-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2'>
                      <Clock size={14} className='text-slate-400' />
                      <h3 className='text-xs font-semibold tracking-wider text-slate-600 dark:text-slate-400 uppercase'>
                        Max TTR per Segmen
                      </h3>
                    </div>
                    <div className='grid grid-cols-2 gap-3'>
                      {ticket.maxTtrReguler && (
                        <TTRCard label='Reguler' value={ticket.maxTtrReguler} />
                      )}
                      {ticket.maxTtrGold && (
                        <TTRCard label='Gold' value={ticket.maxTtrGold} />
                      )}
                      {ticket.maxTtrPlatinum && (
                        <TTRCard
                          label='Platinum'
                          value={ticket.maxTtrPlatinum}
                        />
                      )}
                      {ticket.maxTtrDiamond && (
                        <TTRCard label='Diamond' value={ticket.maxTtrDiamond} />
                      )}
                    </div>
                  </div>

                  <Section icon={<Calendar size={14} />} title='Waktu Penting'>
                    <Field
                      label='Reported Date'
                      value={formatDateTime(ticket.reportedDate)}
                    />
                    <Field
                      label='Booking Date'
                      value={formatDateTime(ticket.bookingDate)}
                    />
                    <Field
                      label='Closed At'
                      value={formatDateTime(ticket.closedAt)}
                    />
                  </Section>
                </>
              )}

              {activeTab === 'tracking' && ticket && (
                <TrackingTimeline ticket={ticket} />
              )}
            </div>

            <div className='sticky bottom-0 flex gap-3 border-t border-slate-200 dark:border-slate-800 bg-linear-to-t dark:from-slate-900 dark:to-slate-950 from-white to-slate-50 px-5 py-4 shadow-lg'>
              {onEdit && (
                <button
                  onClick={() => onEdit(ticket)}
                  className='flex-1 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-all hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98]'
                >
                  ✏️ Edit Tiket
                </button>
              )}
              {onUpdateStatus && (
                <button
                  onClick={() => onUpdateStatus(ticket)}
                  className='flex-1 rounded-xl bg-linear-to-r dark:from-slate-700 dark:to-slate-600 from-slate-900 to-slate-800 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-slate-800 hover:to-slate-700 active:scale-[0.98]'
                >
                  🔄 Update Status
                </button>
              )}
            </div>
          </>
        ) : error ? (
          <div className='flex flex-1 items-center justify-center px-6'>
            <div className='w-full max-w-sm rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-center'>
              <p className='text-sm font-semibold text-red-700 dark:text-red-400'>
                Failed to load ticket
              </p>
              <p className='mt-1 text-xs text-red-700/80 dark:text-red-400/80'>{error}</p>
              <div className='mt-4 flex items-center justify-center gap-2'>
                {onRetry && (
                  <button
                    type='button'
                    onClick={onRetry}
                    className='rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-600'
                  >
                    Retry
                  </button>
                )}
                <button
                  type='button'
                  onClick={handleClose}
                  className='rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className='flex flex-1 items-center justify-center'>
            <div className='flex flex-col items-center gap-3 text-slate-400'>
              {loading ? (
                <div className='h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500' />
              ) : (
                <div className='h-8 w-8 rounded-full border-2 border-slate-200' />
              )}
              <p className='text-sm'>Loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
