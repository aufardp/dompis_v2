'use client';

import { useState, useEffect, useMemo } from 'react';
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
    icon: '📂',
  },
  ASSIGNED: {
    label: 'Assigned',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    dot: 'bg-indigo-500',
    border: 'border-indigo-200',
    icon: '👤',
  },
  ON_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    icon: '⚙️',
  },
  IN_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    icon: '⚙️',
  },
  PENDING: {
    label: 'Pending',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
    icon: '⏸',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
    border: 'border-red-200',
    icon: '❌',
  },
  CLOSE: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    border: 'border-green-200',
    icon: '✅',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    border: 'border-green-200',
    icon: '✅',
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
      className='inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50'
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
      <p className='mb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase'>
        {label}
      </p>
      <p
        className={clsx(
          'text-[13.5px] wrap-break-word',
          mono && 'font-mono',
          highlight ? 'font-semibold text-slate-900' : 'text-slate-700',
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
        'mb-5 rounded-xl border bg-white p-4',
        variant === 'highlighted'
          ? 'border-slate-300 shadow-md'
          : 'border-slate-200 shadow-sm',
        fullWidth ? '' : 'grid grid-cols-2 gap-x-4 gap-y-3',
      )}
    >
      <div
        className={clsx(fullWidth ? 'grid grid-cols-2 gap-x-4' : 'col-span-2')}
      >
        <div className='col-span-2 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2'>
          <span className='text-slate-500'>{icon}</span>
          <h3 className='text-xs font-semibold tracking-wider text-slate-700 uppercase'>
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
    overdue: 'border-red-300 bg-gradient-to-br from-red-50 to-red-100',
    warning: 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100',
    safe: 'border-green-300 bg-gradient-to-br from-green-50 to-green-100',
    unknown: 'border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100',
  };

  const textStyles = {
    overdue: 'text-red-700',
    warning: 'text-amber-700',
    safe: 'text-green-700',
    unknown: 'text-slate-500',
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
    'umum' | 'customer' | 'teknis' | 'sla'
  >('umum');
  const [isVisible, setIsVisible] = useState(false);
  const [evidence, setEvidence] = useState<
    Array<{
      id: number;
      fileName: string;
      filePath: string;
      driveUrl: string | null;
    }>
  >([]);

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
      return;
    }

    const isClosed = (ticket.statusUpdate || ticket?.status || '')
      .toLowerCase()
      .includes('close');

    if (!isClosed) {
      setEvidence([]);
      return;
    }

    fetch(`/api/tickets/${ticket.idTicket}/evidence`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEvidence(d.data ?? []);
      })
      .catch(() => {
        /* silent */
      });
  }, [open, ticket?.idTicket, ticket?.statusUpdate]);

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
  ] as const;

  const rawStatus = ticket?.statusUpdate || ticket?.status || '';
  const workflowKey = normalizeKey(rawStatus);
  const workflowConfig = STATUS_CONFIG[workflowKey] || {
    label: workflowKey || '—',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    dot: 'bg-slate-500',
  };

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex justify-end transition-all duration-300 ease-out',
        isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent',
      )}
      onClick={handleClose}
    >
      <div
        className={clsx(
          'flex h-full w-full max-w-130 transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {ticket ? (
          <>
            <div className='sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 shadow-sm'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-base font-bold text-slate-900'>
                    {ticket.ticket}
                  </span>
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
                  <p className='truncate text-sm font-medium text-slate-700'>
                    {ticket.contactName || '—'}
                  </p>
                  <p className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500'>
                    <span className='font-mono'>{ticket.serviceNo || '—'}</span>
                    <span className='hidden sm:inline'>•</span>
                    <span className='truncate'>{ticket.workzone || '—'}</span>
                  </p>
                </div>

                <div className='flex shrink-0 items-center gap-2'>
                  <CopyButton text={ticket.ticket} label='Copy ticket code' />
                  {ticket.serviceNo && (
                    <CopyButton
                      text={ticket.serviceNo}
                      label='Copy service number'
                    />
                  )}
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

              <div className='mt-3 flex border-b border-slate-200'>
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={clsx(
                      'relative px-4 py-2.5 text-xs font-medium transition-colors',
                      activeTab === tab.key
                        ? 'font-semibold text-slate-900'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <span className='absolute right-0 bottom-0 left-0 h-0.5 bg-slate-900' />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex-1 overflow-y-auto bg-slate-50 px-5 py-4'>
              {activeTab === 'umum' && (
                <>
                  <div
                    className={clsx(
                      'mb-5 rounded-xl border-2 bg-linear-to-br from-white p-5 shadow-md',
                      ttrUrgency === 'overdue'
                        ? 'border-red-300 from-red-50 to-red-100'
                        : ttrUrgency === 'warning'
                          ? 'border-amber-300 from-amber-50 to-amber-100'
                          : 'border-slate-200 from-slate-50 to-slate-100',
                    )}
                  >
                    <div className='flex items-start justify-between gap-4'>
                      <div>
                        <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
                          SLA / TTR
                        </p>
                        <p
                          className={clsx(
                            'mt-1.5 text-base font-bold',
                            ttrUrgency === 'overdue'
                              ? 'text-red-700'
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
                        <p className='mt-1.5 text-sm font-bold text-slate-700'>
                          {formatShortDistance(ticket.reportedDate)}
                        </p>
                        <p className='mt-1 text-xs text-slate-500'>
                          {formatDateTime(ticket.reportedDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                    <p className='mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase'>
                      Summary
                    </p>
                    <p className='text-sm leading-relaxed text-slate-700'>
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
                    <Field label='HASIL_VISIT' value={workflowConfig.label} />
                    {ticket.status && ticket.status !== workflowKey && (
                      <Field label='STATUS' value={ticket.status} />
                    )}
                    <Field
                      label='Closed At'
                      value={formatDateTime(ticket.closedAt)}
                    />
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
                          className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                        >
                          <Phone size={14} />
                          Call
                        </a>
                      </div>
                    )}
                  </Section>

                  <Section icon={<UserCircle size={14} />} title='Segmentasi'>
                    <Field label='Customer Type' value={ticket.customerType} />
                    <Field
                      label='C-Type'
                      value={
                        ticket.ctype
                          ? CustomerType[ticket.ctype]?.label
                          : undefined
                      }
                    />
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

                  {/* Evidence Foto — hanya tampil jika ada data */}
                  {evidence.length > 0 && (
                    <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                      <div className='mb-3 flex items-center gap-2 border-b border-slate-100 pb-2'>
                        <span className='text-slate-500'>📷</span>
                        <h3 className='text-xs font-semibold tracking-wider text-slate-700 uppercase'>
                          Evidence Foto
                        </h3>
                        <span className='ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500'>
                          {evidence.length} foto
                        </span>
                      </div>
                      <div className='grid grid-cols-2 gap-2'>
                        {evidence.map((e) => {
                          const imageUrl =
                            e.driveUrl ??
                            `/uploads/evidence/${e.filePath.replace(
                              /^.*?evidence\//,
                              '',
                            )}`;
                          return (
                            <a
                              key={e.id}
                              href={imageUrl}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100'
                            >
                              <img
                                src={imageUrl}
                                alt={e.fileName}
                                className='h-full w-full object-cover transition-opacity group-hover:opacity-80'
                                onError={(el) => {
                                  (
                                    el.target as HTMLImageElement
                                  ).style.display = 'none';
                                }}
                              />
                              <div className='absolute right-0 bottom-0 left-0 bg-black/50 px-2 py-1'>
                                <p className='truncate text-[10px] text-white'>
                                  {e.fileName}
                                </p>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
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
                  <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase'>
                          SLA / TTR
                        </p>
                        <p className='mt-1 text-sm font-semibold text-slate-700'>
                          {ttrLabel}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500'>
                          Deadline:{' '}
                          {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
                        </p>
                      </div>
                      <div className='text-right'>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase'>
                          Closed
                        </p>
                        <p className='mt-1 text-sm font-semibold text-slate-700'>
                          {ticket.closedAt
                            ? formatShortDistance(ticket.closedAt)
                            : '—'}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500'>
                          {formatDateTime(ticket.closedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='mb-5'>
                    <div className='mb-3 flex items-center gap-2 border-b border-slate-200 pb-2'>
                      <Clock size={14} className='text-slate-400' />
                      <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase'>
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
            </div>

            <div className='sticky bottom-0 flex gap-3 border-t border-slate-200 bg-linear-to-t from-white to-slate-50 px-5 py-4 shadow-lg'>
              {onEdit && (
                <button
                  onClick={() => onEdit(ticket)}
                  className='flex-1 rounded-xl border-2 border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]'
                >
                  ✏️ Edit Tiket
                </button>
              )}
              {onUpdateStatus && (
                <button
                  onClick={() => onUpdateStatus(ticket)}
                  className='flex-1 rounded-xl bg-linear-to-r from-slate-900 to-slate-800 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-slate-800 hover:to-slate-700 active:scale-[0.98]'
                >
                  🔄 Update Status
                </button>
              )}
            </div>
          </>
        ) : error ? (
          <div className='flex flex-1 items-center justify-center px-6'>
            <div className='w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-4 text-center'>
              <p className='text-sm font-semibold text-red-700'>
                Failed to load ticket
              </p>
              <p className='mt-1 text-xs text-red-700/80'>{error}</p>
              <div className='mt-4 flex items-center justify-center gap-2'>
                {onRetry && (
                  <button
                    type='button'
                    onClick={onRetry}
                    className='rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800'
                  >
                    Retry
                  </button>
                )}
                <button
                  type='button'
                  onClick={handleClose}
                  className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
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
}
