import { RefreshCw, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../../components/ui/badge/Badge';
import Button from '../../../components/ui/Button';
import CustomerTypeBadge from '../../../components/tickets/CustomerTypeBadge';
import { getStatusColor, getMaxTtr } from '../../../components/tickets/helpers';
import { TicketSeverity, SEVERITY_COLORS } from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import { formatDateTimeWIB } from '@/app/utils/datetime';

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
  };
  onAssign: (ticketId: string | number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  rank?: number;
  ticketAge?: string;
  severity?: TicketSeverity;
}

export default function TicketRow({
  ticket,
  onAssign,
  isExpanded = false,
  onToggleExpand,
  rank,
  ticketAge,
  severity = 'normal',
}: TicketRowProps) {
  const severityStyles = SEVERITY_COLORS[severity];
  const visit = String(ticket.hasilVisit ?? ticket.status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const isClosed = visit === 'CLOSE' || visit === 'CLOSED';

  return (
    <tr
      className={clsx(
        'hover:bg-surface-2 transition',
        severityStyles.border,
        'border-l-4',
      )}
    >
      <td className='px-3 py-4 text-center'>
        <span className='font-mono text-sm font-semibold text-[var(--text-primary)]'>
          #{rank || '-'}
        </span>
      </td>

      <td className='px-5 py-4'>
        <div>
          <p className='font-medium text-[var(--text-primary)]'>
            {ticket.ticket}
          </p>
          <p className='text-xs text-[var(--text-secondary)]'>
            {ticket.reportedDate ? formatDateTimeWIB(ticket.reportedDate) : '-'}
          </p>
        </div>
      </td>

      <td className='px-5 py-4 text-center text-[var(--text-primary)]'>
        {ticket.serviceNo}
      </td>

      <td className='px-5 py-4'>
        <div className='flex flex-col gap-0.5'>
          <p className='text-sm leading-tight font-medium text-[var(--text-primary)]'>
            {ticket.contactName || '-'}
          </p>
          <p className='text-xs text-[var(--text-secondary)]'>
            {ticket.contactPhone || '-'}
          </p>
        </div>
      </td>

      <td className='px-5 py-4'>
        <div className='flex flex-col gap-0.5'>
          <p className='text-sm leading-tight font-medium text-[var(--text-primary)]'>
            {ticket.alamat || '-'}
          </p>
        </div>
      </td>

      <td className='px-5 py-4 text-center text-[var(--text-primary)]'>
        {ticket.bookingDate || '-'}
      </td>

      <td className='px-5 py-4 text-center'>
        <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
      </td>

      <td className='px-5 py-4 text-center text-[var(--text-primary)]'>
        {getMaxTtr(ticket) || '-'}
      </td>

      <td className='px-5 py-4 text-center'>
        <span
          className={clsx(
            'inline-flex min-w-fit items-center justify-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
            severityStyles.badge,
          )}
        >
          {ticketAge || '-'}
        </span>
      </td>

      <td className='px-5 py-4 text-center text-[var(--text-primary)]'>
        {ticket.jenisTiket || '-'}
      </td>

      <td className='px-5 py-4 text-center text-[var(--text-primary)]'>
        {ticket.workzone}
      </td>

      <td className='px-5 py-4 text-center'>
        {ticket.technicianName || (
          <span className='text-[var(--text-secondary)] italic'>
            Unassigned
          </span>
        )}
      </td>

      <td className='px-5 py-4 text-center'>
        <Badge size='sm' color={getStatusColor(ticket.hasilVisit || '')}>
          {ticket.hasilVisit || '-'}
        </Badge>
      </td>

      <td className='px-3 py-4 text-center'>
        <button
          onClick={onToggleExpand}
          className={clsx(
            'hover:bg-surface-2 rounded-lg p-2 transition-colors',
            isExpanded ? 'text-blue-500' : 'text-[var(--text-secondary)]',
          )}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </td>

      <td className='px-3 py-4 text-center'>
        {isClosed ? (
          <span className='text-xs text-[var(--text-secondary)]'>-</span>
        ) : (
          <Button
            onClick={() => onAssign(ticket.idTicket ?? '')}
            className={clsx(
              'flex items-center gap-2 transition-all duration-200',
              ticket.teknisiUserId
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
            size='sm'
          >
            {ticket.teknisiUserId ? (
              <RefreshCw size={16} />
            ) : (
              <UserPlus size={16} />
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}
