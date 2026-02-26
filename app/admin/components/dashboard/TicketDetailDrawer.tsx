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

type TicketStatusKey =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
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
  { label: string; color: string; bg: string; dot: string }
> = {
  OPEN: {
    label: 'Open',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
  },
  ASSIGNED: {
    label: 'Assigned',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    dot: 'bg-indigo-500',
  },
  ON_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  IN_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  PENDING: {
    label: 'Pending',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  ESCALATED: {
    label: 'Escalated',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    dot: 'bg-orange-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
  },
  CLOSE: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
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
  if (!ticket?.customerType) return null;
  const ct = String(ticket.customerType).toLowerCase();
  if (ct.includes('diamond')) return ticket.maxTtrDiamond ?? null;
  if (ct.includes('platinum')) return ticket.maxTtrPlatinum ?? null;
  if (ct.includes('gold')) return ticket.maxTtrGold ?? null;
  if (ct.includes('reguler') || ct.includes('regular'))
    return ticket.maxTtrReguler ?? null;
  // fallback: if we only have one filled, use it
  return (
    ticket.maxTtrDiamond ||
    ticket.maxTtrPlatinum ||
    ticket.maxTtrGold ||
    ticket.maxTtrReguler ||
    null
  );
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

function StatusBadge({ label, color, bg, dot, icon }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        bg,
        color,
        'border-opacity-20',
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />}
      {icon && <span>{icon}</span>}
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
}

function Field({ label, value, mono, fullWidth }: FieldProps) {
  const displayValue = value ?? '—';
  return (
    <div className={clsx(fullWidth ? 'col-span-2' : '')}>
      <p className='mb-0.5 text-[10.5px] tracking-wider text-slate-400 uppercase'>
        {label}
      </p>
      <p
        className={clsx(
          'text-[13.5px] wrap-break-word text-slate-800',
          mono && 'font-mono',
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
}

function Section({ icon, title, children, fullWidth }: SectionProps) {
  return (
    <div
      className={clsx(
        'mb-5',
        fullWidth ? '' : 'grid grid-cols-2 gap-x-4 gap-y-3',
      )}
    >
      <div
        className={clsx(fullWidth ? 'grid grid-cols-2 gap-x-4' : 'col-span-2')}
      >
        <div className='col-span-2 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2'>
          <span className='text-slate-400'>{icon}</span>
          <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase'>
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
    overdue: 'border-red-300 bg-red-50',
    warning: 'border-amber-300 bg-amber-50',
    safe: 'border-green-300 bg-green-50',
    unknown: 'border-slate-200 bg-slate-50',
  };

  const textStyles = {
    overdue: 'text-red-700',
    warning: 'text-amber-700',
    safe: 'text-green-700',
    unknown: 'text-slate-500',
  };

  return (
    <div className={clsx('rounded-lg border p-3', styles[urgency])}>
      <p className='mb-1 text-[10.5px] tracking-wider text-slate-500 uppercase'>
        {label}
      </p>
      <p className={clsx('text-sm font-medium', textStyles[urgency])}>
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

  const workflowKey = normalizeKey(ticket?.hasilVisit || ticket?.status);
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
            <div className='sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-sm font-semibold text-slate-800'>
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

              <div className='flex border-b border-slate-200'>
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={clsx(
                      'relative px-4 py-2.5 text-xs font-medium transition-colors',
                      activeTab === tab.key
                        ? 'text-slate-900'
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
                      'mb-5 rounded-xl border bg-white p-4',
                      ttrUrgency === 'overdue'
                        ? 'border-red-200'
                        : ttrUrgency === 'warning'
                          ? 'border-amber-200'
                          : 'border-slate-200',
                    )}
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase'>
                          SLA / TTR
                        </p>
                        <p
                          className={clsx(
                            'mt-1 text-sm font-semibold',
                            ttrUrgency === 'overdue'
                              ? 'text-red-700'
                              : ttrUrgency === 'warning'
                                ? 'text-amber-700'
                                : 'text-slate-700',
                          )}
                        >
                          {ttrLabel}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500'>
                          Deadline:{' '}
                          {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
                        </p>
                      </div>

                      <div className='text-right'>
                        <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase'>
                          Reported
                        </p>
                        <p className='mt-1 text-sm font-semibold text-slate-700'>
                          {formatShortDistance(ticket.reportedDate)}
                        </p>
                        <p className='mt-0.5 text-xs text-slate-500'>
                          {formatDateTime(ticket.reportedDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='mb-5 rounded-lg border border-slate-200 bg-white p-4'>
                    <p className='mb-2 text-xs tracking-wider text-slate-400 uppercase'>
                      Summary
                    </p>
                    <p className='text-sm text-slate-700'>{ticket.summary}</p>
                  </div>

                  <Section
                    icon={<Activity size={14} />}
                    title='Informasi Tiket'
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
                    {ticket.pendingReason && (
                      <div className='col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3'>
                        <div className='flex items-start gap-2'>
                          <AlertTriangle
                            size={16}
                            className='mt-0.5 text-amber-500'
                          />
                          <div>
                            <p className='mb-0.5 text-[10.5px] tracking-wider text-amber-600 uppercase'>
                              Pending Reason
                            </p>
                            <p className='text-sm text-amber-800'>
                              {ticket.pendingReason}
                            </p>
                          </div>
                        </div>
                      </div>
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

            <div className='sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white px-5 py-4'>
              {onEdit && (
                <button
                  onClick={() => onEdit(ticket)}
                  className='flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50'
                >
                  Edit Tiket
                </button>
              )}
              {onUpdateStatus && (
                <button
                  onClick={() => onUpdateStatus(ticket)}
                  className='flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800'
                >
                  Update Status
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
