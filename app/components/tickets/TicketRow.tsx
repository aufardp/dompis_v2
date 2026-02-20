import { RefreshCw, UserPlus } from 'lucide-react';
import Badge from '../ui/badge/Badge';
import Button from '../ui/Button';
import CustomerTypeBadge from './CustomerTypeBadge';
import {
  formatDate,
  getStatusColor,
  getMaxTtr,
  getTicketAge,
  getTicketAgeColorClass,
} from './helpers';

export default function TicketRow({
  ticket,
  onAssign,
}: {
  ticket: any;
  onAssign: (ticketId: string) => void;
}) {
  return (
    <tr className='transition hover:bg-gray-50'>
      <td className='px-5 py-4'>
        <div>
          <p className='font-medium'>{ticket.ticket}</p>
          <p className='text-xs text-gray-500'>
            {formatDate(ticket.reportedDate)}
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

      <td className='px-5 py-4 text-center'>{ticket.jenisTiket || '-'}</td>

      <td className='px-5 py-4 text-center'>
        <span
          className={`inline-flex min-w-fit items-center justify-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${getTicketAgeColorClass(
            ticket,
          )}`}
        >
          {getTicketAge(ticket)}
        </span>
      </td>

      <td className='max-w-xs truncate px-5 py-4'>{ticket.summary}</td>

      <td className='px-5 py-4 text-center'>{ticket.workzone}</td>

      <td className='px-5 py-4 text-center'>
        {ticket.technicianName || (
          <span className='text-gray-400 italic'>Unassigned</span>
        )}
      </td>

      <td className='px-5 py-4 text-center'>
        <Badge size='sm' color={getStatusColor(ticket.hasilVisit)}>
          {ticket.hasilVisit}
        </Badge>
      </td>

      <td className='px-5 py-4 text-center'>
        <Button
          onClick={() => onAssign(ticket.idTicket)}
          className={`flex items-center gap-2 transition-all duration-200 ${
            ticket.teknisiUserId
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } hover:scale-[1.02] active:scale-[0.98]`}
        >
          {ticket.teknisiUserId ? (
            <>
              <RefreshCw size={16} />
            </>
          ) : (
            <>
              <UserPlus size={16} />
            </>
          )}
        </Button>
      </td>
    </tr>
  );
}
