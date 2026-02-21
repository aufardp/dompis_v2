'use client';

import { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  UserCircle,
  Activity,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type TicketCtype = 'DIAMOND' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'REGULER';
type TicketVisitStatus = 'SUCCESS' | 'FAILED' | 'RESCHEDULE';
type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

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
  hasilVisit?: TicketVisitStatus;
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
  onEdit?: (ticket: TicketDetail) => void;
  onUpdateStatus?: (ticket: TicketDetail) => void;
}

const CTYPE_CONFIG: Record<
  TicketCtype,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  DIAMOND: {
    label: 'Diamond',
    icon: '◈',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
  },
  PLATINUM: {
    label: 'Platinum',
    icon: '◆',
    color: 'text-violet-500',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
  },
  GOLD: {
    label: 'Gold',
    icon: '◆',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  SILVER: {
    label: 'Silver',
    icon: '◆',
    color: 'text-gray-500',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  REGULER: {
    label: 'Reguler',
    icon: '◆',
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
};

const STATUS_CONFIG: Record<
  string,
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
};

const VISIT_STATUS_CONFIG: Record<
  TicketVisitStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  SUCCESS: {
    label: 'Success',
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
  },
  FAILED: {
    label: 'Failed',
    color: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
  },
  RESCHEDULE: {
    label: 'Reschedule',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
};

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: id });
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

function CTypeBadge({ ctype }: { ctype?: TicketCtype }) {
  if (!ctype || !CTYPE_CONFIG[ctype]) {
    return <span className='text-slate-400'>—</span>;
  }
  const config = CTYPE_CONFIG[ctype];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        config.bg,
        config.color,
        config.border,
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
      <p className={clsx('text-[13.5px] text-slate-800', mono && 'font-mono')}>
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
  onEdit,
  onUpdateStatus,
}: TicketDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<
    'umum' | 'customer' | 'teknis' | 'sla'
  >('umum');
  const [isVisible, setIsVisible] = useState(false);

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

  if (!open && !isVisible) return null;

  const tabs = [
    { key: 'umum', label: 'Umum' },
    { key: 'customer', label: 'Customer' },
    { key: 'teknis', label: 'Teknis' },
    { key: 'sla', label: 'SLA' },
  ] as const;

  const statusConfig = STATUS_CONFIG[ticket?.status ?? ''] || {
    label: ticket?.status ?? '—',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    dot: 'bg-slate-500',
  };
  const visitConfig = ticket?.hasilVisit
    ? VISIT_STATUS_CONFIG[ticket.hasilVisit]
    : null;

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
                  <StatusBadge {...statusConfig} />
                  <CTypeBadge ctype={ticket.ctype} />
                </div>
                <button
                  onClick={handleClose}
                  className='rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                >
                  <X size={20} />
                </button>
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
                    <Field label='Status' value={statusConfig.label} />
                    {visitConfig && (
                      <Field label='Hasil Visit' value={visitConfig.label} />
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
                  </Section>

                  <Section icon={<UserCircle size={14} />} title='Segmentasi'>
                    <Field label='Customer Type' value={ticket.customerType} />
                    <Field
                      label='C-Type'
                      value={
                        ticket.ctype
                          ? CTYPE_CONFIG[ticket.ctype]?.label
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
        ) : (
          <div className='flex flex-1 items-center justify-center'>
            <div className='flex flex-col items-center gap-3 text-slate-400'>
              <div className='h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500' />
              <p className='text-sm'>Loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
