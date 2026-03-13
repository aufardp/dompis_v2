import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import clsx from 'clsx';
import CustomerTypeBadge from '../../../components/tickets/CustomerTypeBadge';
import { getStatusColor, getMaxTtr } from '../../../components/tickets/helpers';
import { TicketSeverity, SEVERITY_COLORS } from '@/app/libs/tickets/sort';
import { getEffectiveFlaggingLabel } from '@/app/libs/tickets/effective';
import { TicketCtype } from '@/app/types/ticket';
import { formatDateTimeFullWIB } from '@/app/utils/datetime';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import TtrCountdownBadge from './TtrCountdownBadge';
import { TtrCountdown } from '@/app/hooks/useTtrCountdown';

export interface TicketRowSemestaProps {
  ticket: {
    idTicket?: number;
    ticket?: string;
    serviceNo?: string;
    contactName?: string | null;
    contactPhone?: string | null;
    alamat?: string | null;
    bookingDate?: string | null;
    ctype?: TicketCtype;
    customerType?: string;
    summary?: string;
    jenisTiket?: string;
    workzone?: string;
    technicianName?: string | null;
    teknisiUserId?: number | null;
    hasilVisit?: string | null;
    closedAt?: string | null;
    reportedDate?: string | null;
    status?: string | null;
    STATUS_UPDATE?: string | null;
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
    flaggingManja?: string | null;
    guaranteeStatus?: string | null;
  };
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  rowNumber?: number;
  ticketAge?: string;
  severity?: TicketSeverity;
  slaLabel?: 'On Track' | 'At Risk' | 'Overdue';
  ttrCountdown?: TtrCountdown | null;
}

const SLA_STYLES = {
  'On Track': {
    badge:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  'At Risk': {
    badge:
      'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  Overdue: {
    badge: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    dot: 'bg-red-500',
  },
};

const JENIS_STYLES: Record<string, string> = {
  SQM: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  Reguler:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
};

export default function TicketRowSemesta({
  ticket,
  isExpanded = false,
  onToggleExpand,
  rowNumber = 0,
  ticketAge,
  severity = 'normal',
  slaLabel,
  ttrCountdown,
}: TicketRowSemestaProps) {
  const severityStyles = SEVERITY_COLORS[severity];

  const isClosed = isTicketClosed(ticket.STATUS_UPDATE);

  const maxTtr = getMaxTtr(ticket);
  const sla = slaLabel ? SLA_STYLES[slaLabel] : null;
  const techInitial = ticket.technicianName?.charAt(0).toUpperCase();

  const isGuarantee =
    String(ticket.guaranteeStatus ?? '')
      .trim()
      .toLowerCase() === 'guarantee';
  const flagLabel = getEffectiveFlaggingLabel(ticket);

  const handleDetailClick = () => {
    onToggleExpand?.();
  };

  return (
    <>
      <tr
        className={clsx(
          'group transition-colors duration-100',
          'border-l-4',
          severityStyles.border,
          'hover:bg-surface-2',
        )}
      >
        {/* Expand toggle */}
        <td className='w-10 px-3 py-3 text-center'>
          <button
            onClick={handleDetailClick}
            className='flex items-center justify-center rounded-md p-1 text-(--text-secondary) transition hover:bg-(--border) hover:text-(--text-primary)'
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </button>
        </td>

        {/* Row Number */}
        <td className='px-3 py-3 text-center'>
          <span className='font-mono text-xs font-bold text-(--text-primary)'>
            #{rowNumber}
          </span>
        </td>

        {/* Ticket ID + date */}
        <td className='px-4 py-3'>
          <p className='font-mono text-xs font-bold text-(--text-primary)'>
            {ticket.ticket}
          </p>
          <p className='mt-0.5 text-[10px] text-(--text-secondary)'>
            {ticket.reportedDate
              ? formatDateTimeFullWIB(ticket.reportedDate)
              : '-'}
          </p>
        </td>

        {/* Service No */}
        <td className='px-4 py-3 text-center'>
          <div className='inline-flex items-center justify-center gap-2'>
            <span className='font-mono text-xs text-(--text-primary)'>
              {ticket.serviceNo ?? '-'}
            </span>
            {isGuarantee && (
              <span className='rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/15 dark:text-rose-400'>
                FFG
              </span>
            )}
          </div>
        </td>

        {/* Customer */}
        <td className='px-4 py-3'>
          <p className='text-sm leading-tight font-semibold text-(--text-primary) uppercase'>
            {ticket.contactName || '-'}
          </p>
          <p className='mt-0.5 text-[10px] text-(--text-secondary)'>
            {ticket.contactPhone || '-'}
          </p>
        </td>

        {/* Address */}
        <td className='max-w-40 px-4 py-3'>
          {ticket.alamat ? (
            <p className='line-clamp-2 text-xs leading-relaxed text-(--text-primary)'>
              {ticket.alamat}
            </p>
          ) : (
            <span className='text-xs text-(--text-secondary) italic'>—</span>
          )}
        </td>

        {/* Booking Date */}
        <td className='px-4 py-3 text-center'>
          <div className='inline-flex flex-wrap items-center justify-center gap-2'>
            <span className='text-xs text-(--text-secondary)'>
              {ticket.bookingDate
                ? formatDateTimeFullWIB(ticket.bookingDate)
                : '-'}
            </span>
            {flagLabel && (
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide',
                  flagLabel === 'P1'
                    ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                )}
                title='Flagging Manja'
              >
                {flagLabel}
              </span>
            )}
          </div>
        </td>

        {/* Customer Type */}
        <td className='px-4 py-3 text-center'>
          <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
        </td>

        {/* Max TTR */}
        <td className='px-4 py-3 text-center'>
          <TtrCountdownBadge ticket={ticket} />
        </td>

        {/* Age + SLA */}
        <td className='px-4 py-3 text-center'>
          <div className='inline-flex flex-col items-center gap-0.5'>
            <span
              className={clsx(
                'rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap',
                severityStyles.badge,
              )}
            >
              {ticketAge || '-'}
            </span>
            {sla && (
              <span
                className={clsx(
                  'flex items-center gap-1 text-[9px] font-semibold',
                  sla.badge.split(' ')[1],
                )}
              >
                <span className={clsx('h-1.5 w-1.5 rounded-full', sla.dot)} />
                {slaLabel}
              </span>
            )}
          </div>
        </td>

        {/* Jenis Tiket */}
        <td className='px-4 py-3 text-center'>
          {ticket.jenisTiket ? (
            <span
              className={clsx(
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                JENIS_STYLES[ticket.jenisTiket] ??
                  'bg-slate-100 text-slate-500',
              )}
            >
              {ticket.jenisTiket}
            </span>
          ) : (
            <span className='text-xs text-(--text-secondary) italic'>—</span>
          )}
        </td>

        {/* Workzone */}
        <td className='px-4 py-3 text-center'>
          <span className='text-xs font-semibold text-(--text-primary)'>
            {ticket.workzone ?? '-'}
          </span>
        </td>

        {/* Technician */}
        <td className='px-4 py-3 text-center'>
          {ticket.technicianName ? (
            <div className='inline-flex items-center gap-1.5'>
              <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white'>
                {techInitial}
              </div>
              <span className='text-xs text-(--text-primary)'>
                {ticket.technicianName}
              </span>
            </div>
          ) : (
            <span className='rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-400'>
              Unassigned
            </span>
          )}
        </td>

        {/* Status */}
        <td className='px-4 py-3 text-center'>
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase',
              `badge-${getStatusColor(ticket.STATUS_UPDATE || '')}`,
            )}
          >
            {ticket.STATUS_UPDATE || '-'}
          </span>
        </td>

        {/* Action: Detail only */}
        <td className='px-3 py-3 text-center'>
          <button
            onClick={handleDetailClick}
            title='Lihat Detail'
            className='bg-surface inline-flex items-center gap-1.5 rounded-xl border border-(--border) px-3 py-1.5 text-xs font-semibold text-(--text-secondary) transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/15 dark:hover:text-blue-400'
          >
            <Eye size={13} />
            Detail
          </button>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr>
          <td colSpan={15} className='bg-surface-2 px-4 py-4'>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
              <div>
                <h4 className='text-xs font-bold text-(--text-secondary) uppercase'>
                  Summary
                </h4>
                <p className='mt-1 text-sm text-(--text-primary)'>
                  {ticket.summary || '-'}
                </p>
              </div>
              {ticket.closedAt && (
                <div>
                  <h4 className='text-xs font-bold text-(--text-secondary) uppercase'>
                    Closed At
                  </h4>
                  <p className='mt-1 text-sm text-(--text-primary)'>
                    {formatDateTimeFullWIB(ticket.closedAt)}
                  </p>
                </div>
              )}
              <div>
                <h4 className='text-xs font-bold text-(--text-secondary) uppercase'>
                  Customer Type
                </h4>
                <p className='mt-1 text-sm text-(--text-primary)'>
                  {ticket.customerType || '-'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
