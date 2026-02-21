'use client';

import {
  User,
  Phone,
  MapPin,
  Wrench,
  Clock,
  Calendar,
  UserCircle,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type TicketCtype = 'DIAMOND' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'REGULER';

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
  hasilVisit?: string;
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

interface TicketDetailRowProps {
  ticket: TicketDetail;
}

const CTYPE_CONFIG: Record<
  TicketCtype,
  { label: string; color: string; bg: string }
> = {
  DIAMOND: { label: 'Diamond', color: 'text-cyan-600', bg: 'bg-cyan-50' },
  PLATINUM: { label: 'Platinum', color: 'text-violet-600', bg: 'bg-violet-50' },
  GOLD: { label: 'Gold', color: 'text-amber-600', bg: 'bg-amber-50' },
  SILVER: { label: 'Silver', color: 'text-gray-600', bg: 'bg-gray-50' },
  REGULER: { label: 'Reguler', color: 'text-slate-600', bg: 'bg-slate-50' },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  OPEN: { label: 'Open', color: 'text-blue-600', bg: 'bg-blue-50' },
  ASSIGNED: { label: 'Assigned', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ON_PROGRESS: {
    label: 'On Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  PENDING: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
  ESCALATED: {
    label: 'Escalated',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  CANCELLED: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50' },
  CLOSE: { label: 'Closed', color: 'text-green-600', bg: 'bg-green-50' },
};

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: id });
  } catch {
    return '—';
  }
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className='text-[10px] tracking-wider text-slate-400 uppercase'>
        {label}
      </p>
      <p className={clsx('text-xs text-slate-700', mono && 'font-mono')}>
        {value || '—'}
      </p>
    </div>
  );
}

export default function TicketDetailRow({ ticket }: TicketDetailRowProps) {
  const statusConfig = STATUS_CONFIG[ticket.status] || {
    label: ticket.status,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
  };
  const ctypeConfig = ticket.ctype ? CTYPE_CONFIG[ticket.ctype] : null;

  return (
    <tr className='bg-slate-50'>
      <td colSpan={14} className='px-4 py-4'>
        <div className='grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4'>
          <div className='space-y-3 border-r border-slate-100 pr-4'>
            <div className='flex items-center gap-2'>
              <span className='font-mono text-sm font-semibold text-slate-800'>
                {ticket.ticket}
              </span>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  statusConfig.bg,
                  statusConfig.color,
                )}
              >
                {statusConfig.label}
              </span>
              {ctypeConfig && (
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    ctypeConfig.bg,
                    ctypeConfig.color,
                  )}
                >
                  {ctypeConfig.label}
                </span>
              )}
            </div>
            <p className='text-xs text-slate-600'>{ticket.summary}</p>
            <div className='grid grid-cols-2 gap-2'>
              <DetailItem label='Jenis Tiket' value={ticket.jenisTiket} />
              <DetailItem label='Source' value={ticket.sourceTicket} />
              <DetailItem
                label='Reported'
                value={formatDateTime(ticket.reportedDate)}
              />
              <DetailItem
                label='Booking'
                value={formatDateTime(ticket.bookingDate)}
              />
            </div>
          </div>

          <div className='space-y-3 border-r border-slate-100 pr-4'>
            <h4 className='flex items-center gap-1 text-xs font-semibold tracking-wider text-slate-600 uppercase'>
              <User size={12} /> Customer
            </h4>
            <div className='grid grid-cols-2 gap-2'>
              <DetailItem label='Name' value={ticket.contactName} />
              <DetailItem label='Phone' value={ticket.contactPhone} mono />
              <DetailItem label='Service No' value={ticket.serviceNo} mono />
              <DetailItem label='Type' value={ticket.customerType} />
              <DetailItem label='Segment' value={ticket.customerSegment} />
              <DetailItem label='Service' value={ticket.serviceType} />
            </div>
          </div>

          <div className='space-y-3 border-r border-slate-100 pr-4'>
            <h4 className='flex items-center gap-1 text-xs font-semibold tracking-wider text-slate-600 uppercase'>
              <MapPin size={12} /> Location
            </h4>
            <DetailItem label='Workzone' value={ticket.workzone} />
            <DetailItem label='Alamat' value={ticket.alamat} />
          </div>

          <div className='space-y-3'>
            <h4 className='flex items-center gap-1 text-xs font-semibold tracking-wider text-slate-600 uppercase'>
              <Wrench size={12} /> Technical
            </h4>
            <div className='grid grid-cols-2 gap-2'>
              <DetailItem label='Device' value={ticket.deviceName} />
              <DetailItem label='Symptom' value={ticket.symptom} />
              <DetailItem label='RCA' value={ticket.rca} />
              <DetailItem label='Sub RCA' value={ticket.subRca} />
              <DetailItem label='Technician' value={ticket.technicianName} />
              <DetailItem label='Pending' value={ticket.pendingReason} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
