import { RefreshCw, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../ui/badge/Badge';
import Button from '../ui/Button';
import CustomerTypeBadge from './CustomerTypeBadge';
import { formatDate, getStatusColor, getMaxTtr } from './helpers';
import { TicketSeverity, SEVERITY_COLORS } from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';

interface TicketRowProps {
  ticket: {
    idTicket?: number;
    ticket?: string;
    serviceNo?: string;
    contactName?: string | null;
    contactPhone?: string | null;
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
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
  };
  onAssign: (ticketId: string) => void;
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

  return (
    <tr
      className={clsx(
        'transition hover:bg-gray-50',
        severityStyles.border,
        'border-l-4',
      )}
    >
      <td className='px-3 py-4 text-center'>
        <span className='font-mono text-sm font-semibold text-slate-700'>
          #{rank || '-'}
        </span>
      </td>

      <td className='px-5 py-4'>
        <div>
          <p className='font-medium'>{ticket.ticket}</p>
          <p className='text-xs text-gray-500'>
            {ticket.reportedDate ? formatDate(ticket.reportedDate) : '-'}
          </p>
        </div>
      </td>

      <td className='px-5 py-4 text-center'>{ticket.serviceNo}</td>

      <td className='max-w-xs truncate px-5 py-4'>
        <p className='text-sm'>{ticket.contactName || '-'}</p>
        <p className='text-xs text-gray-500'>{ticket.contactPhone || '-'}</p>
      </td>

      <td className='px-5 py-4 text-center'>
        <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
      </td>

      <td className='px-5 py-4 text-center'>{getMaxTtr(ticket) || '-'}</td>

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

      <td className='px-5 py-4 text-center'>{ticket.jenisTiket || '-'}</td>

      <td className='px-5 py-4 text-center'>{ticket.workzone}</td>

      <td className='px-5 py-4 text-center'>
        {ticket.technicianName || (
          <span className='text-gray-400 italic'>Unassigned</span>
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
            'rounded-lg p-2 transition-colors hover:bg-slate-100',
            isExpanded ? 'text-blue-600' : 'text-slate-400',
          )}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </td>

      <td className='px-3 py-4 text-center'>
        <Button
          onClick={() => onAssign(String(ticket.idTicket))}
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
      </td>
    </tr>
  );
}
