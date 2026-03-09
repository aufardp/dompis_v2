import { RefreshCw, UserPlus, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import clsx from 'clsx';
import CustomerTypeBadge from '../../../components/tickets/CustomerTypeBadge';
import { getStatusColor, getMaxTtr } from '../../../components/tickets/helpers';
import { TicketSeverity, SEVERITY_COLORS } from '@/app/libs/tickets/sort';
import { getEffectiveFlaggingLabel } from '@/app/libs/tickets/effective';
import { getJenisStyle } from '@/app/libs/tickets/jenis';
import { TicketCtype } from '@/app/types/ticket';
import { formatDateTimeFullWIB } from '@/app/utils/datetime';
import { isTicketClosed } from '@/app/libs/ticket-utils';

export interface TicketRowProps {
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
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
    flaggingManja?: string | null;
    guaranteeStatus?: string | null;
    statusUpdate?: string | null;
  };
  onAssign: (ticketId: string | number) => void;
  onDetail?: (ticketId: string | number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  rank?: number;
  ticketAge?: string;
  severity?: TicketSeverity;
  slaLabel?: 'On Track' | 'At Risk' | 'Overdue';
  selected?: boolean;
  onSelect?: () => void;
}

const SLA_STYLES = {
  'On Track': {
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  'At Risk': {
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  Overdue: {
    badge: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    dot: 'bg-red-500',
  },
};

export default function TicketRow({
  ticket,
  onAssign,
  onDetail,
  isExpanded = false,
  onToggleExpand,
  rank,
  ticketAge,
  severity = 'normal',
  slaLabel,
  selected = false,
  onSelect,
}: TicketRowProps) {
  const severityStyles = SEVERITY_COLORS[severity];

  const isClosed = isTicketClosed(ticket.statusUpdate);

  const maxTtr = getMaxTtr(ticket);
  const sla = slaLabel ? SLA_STYLES[slaLabel] : null;
  const techInitial = ticket.technicianName?.charAt(0).toUpperCase();

  const isGuarantee =
    String(ticket.guaranteeStatus ?? '')
      .trim()
      .toLowerCase() === 'guarantee';
  const flagLabel = getEffectiveFlaggingLabel(ticket);

  const handleAssignClick = () => {
    onAssign(ticket.idTicket ?? '');
  };

  const handleDetailClick = () => {
    if (onDetail) {
      onDetail(ticket.idTicket ?? ticket.ticket ?? '');
    } else {
      onToggleExpand?.();
    }
  };

  return (
    <tr
      className={clsx(
        'group transition-colors duration-100',
        'border-l-4',
        severityStyles.border,
        selected ? 'bg-blue-50/60 dark:bg-blue-500/10' : 'hover:bg-surface-2',
      )}
    >
      {/* Checkbox */}
      <td className='w-10 px-3 py-3 text-center'>
        <input
          type='checkbox'
          checked={selected}
          onChange={onSelect}
          className='rounded border-slate-300 accent-blue-600'
          onClick={(e) => e.stopPropagation()}
        />
      </td>

      {/* Rank */}
      <td className='px-3 py-3 text-center'>
        <div className='flex items-center justify-center gap-1.5'>
          <span
            className={clsx(
              'h-4 w-1 rounded-full',
              severityStyles.border.replace('border-l-', 'bg-'),
            )}
            style={{
              background:
                severity === 'critical'
                  ? '#ef4444'
                  : severity === 'warning'
                    ? '#f59e0b'
                    : '#94a3b8',
            }}
          />
          <span className='font-mono text-sm font-bold text-(--text-primary)'>
            #{rank ?? '-'}
          </span>
        </div>
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
        {maxTtr ? (
          <span className='rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'>
            ⏱ {maxTtr}
          </span>
        ) : (
          <span className='text-xs text-(--text-secondary) italic'>—</span>
        )}
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
              getJenisStyle(ticket.jenisTiket), // ← CHANGED: use centralized utility
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
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
            `badge-${getStatusColor(ticket.statusUpdate || '')}`,
          )}
        >
          {ticket.statusUpdate || '-'}
        </span>
      </td>

      {/* ── Merged Action: Detail + Assign ── */}
      <td className='px-3 py-3 text-center'>
        {isClosed ? (
          /* Closed: only Detail button */
          <button
            onClick={handleDetailClick}
            title='Lihat Detail'
            className='bg-surface inline-flex items-center gap-1.5 rounded-xl border border-(--border) px-3 py-1.5 text-xs font-semibold text-(--text-secondary) transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/15 dark:hover:text-blue-400'
          >
            <Eye size={13} />
          </button>
        ) : (
          /* Active: split button — Detail | Assign/Reassign */
          <div className='inline-flex overflow-hidden rounded-xl border border-(--border) shadow-sm'>
            {/* Detail half */}
            <button
              onClick={handleDetailClick}
              title='Lihat Detail'
              className='bg-surface flex items-center gap-1.5 border-r border-(--border) px-3 py-1.5 text-xs font-semibold text-(--text-secondary) transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/15 dark:hover:text-blue-400'
            >
              <Eye size={13} />
            </button>

            {/* Assign / Reassign half */}
            <button
              onClick={handleAssignClick}
              title={
                ticket.teknisiUserId ? 'Reassign Teknisi' : 'Assign Teknisi'
              }
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white transition',
                ticket.teknisiUserId
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-blue-600 hover:bg-blue-700',
              )}
            >
              {ticket.teknisiUserId ? (
                <>
                  <RefreshCw size={12} />
                </>
              ) : (
                <>
                  <UserPlus size={12} />
                </>
              )}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
