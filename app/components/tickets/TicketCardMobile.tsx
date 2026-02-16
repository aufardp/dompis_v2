import Badge from '../ui/badge/Badge';
import Button from '../ui/Button';
import { formatDate, getStatusColor } from './helpers';

export default function TicketCardMobile({
  ticket,
  onAssign,
}: {
  ticket: any;
  onAssign: (ticketId: string) => void;
}) {
  return (
    <div className='rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md'>
      <div className='mb-3 flex items-start justify-between'>
        <div>
          <p className='font-semibold text-gray-800'>{ticket.ticket}</p>
          <p className='text-xs text-gray-500'>
            {formatDate(ticket.reportedDate)}
          </p>
        </div>
        <Badge size='sm' color={getStatusColor(ticket.hasilVisit)}>
          {ticket.hasilVisit}
        </Badge>
      </div>

      <div className='mb-3 space-y-1 text-sm'>
        <p className='font-medium'>{ticket.contactName}</p>
        <p className='text-xs text-gray-500'>{ticket.contactPhone}</p>
        <p className='text-xs text-gray-500'>{ticket.serviceNo}</p>
      </div>

      <Button
        className='w-full bg-green-500'
        onClick={() => onAssign(ticket.ticket)}
      >
        {ticket.technician_id ? 'Reassign' : 'Assign'}
      </Button>
    </div>
  );
}
