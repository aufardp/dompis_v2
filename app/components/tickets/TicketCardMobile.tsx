import {
  RefreshCw,
  UserPlus,
  MapPin,
  Phone,
  Hash,
  Clock3,
  User,
  Calendar,
  MapPinned,
} from 'lucide-react';
import Badge from '../ui/badge/Badge';
import Button from '../ui/Button';
import CustomerTypeBadge from './CustomerTypeBadge';
import {
  formatDate,
  getMaxTtr,
  getStatusColor,
  getTicketAge,
  getTicketAgeColorClass,
} from './helpers';

export default function TicketCardMobile({
  ticket,
  onAssign,
}: {
  ticket: any;
  onAssign: (ticketId: string | number) => void;
}) {
  const isAssigned = Boolean(ticket?.teknisiUserId);
  const visit = String(ticket?.hasilVisit ?? ticket?.status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const isClosed = visit === 'CLOSE' || visit === 'CLOSED';
  const maxTtr = getMaxTtr(ticket) || '-';

  return (
    <div className='group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4'>
      <div className='flex items-start justify-between gap-2 sm:gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
            <p className='truncate text-sm font-semibold text-slate-900'>
              {ticket.ticket || '-'}
            </p>
            <span className='text-xs text-slate-500'>
              {formatDate(ticket.reportedDate)}
            </span>
          </div>
          <p className='mt-1 truncate text-sm text-slate-700'>
            {ticket.summary || '-'}
          </p>
        </div>

        <div className='flex shrink-0 flex-col items-end gap-1'>
          <Badge size='sm' color={getStatusColor(ticket.hasilVisit)}>
            {ticket.hasilVisit || '-'}
          </Badge>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTicketAgeColorClass(ticket)}`}
          >
            {getTicketAge(ticket)}
          </span>
        </div>
      </div>

      <div className='mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2'>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <Hash className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Service</p>
            <p className='truncate font-semibold'>{ticket.serviceNo || '-'}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <MapPin className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Workzone</p>
            <p className='truncate font-semibold'>{ticket.workzone || '-'}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <User className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Type</p>
            <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <Clock3 className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Max TTR</p>
            <p className='truncate font-semibold'>{maxTtr}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <Calendar className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Booking Date</p>
            <p className='truncate font-semibold'>
              {ticket.bookingDate || '-'}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
          <MapPinned className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[11px] text-slate-500'>Address</p>
            <p className='truncate font-semibold'>{ticket.alamat || '-'}</p>
          </div>
        </div>
      </div>

      <div className='mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3 sm:py-2'>
        <div className='min-w-0'>
          <p className='text-[11px] text-slate-500'>Customer</p>
          <p className='truncate text-sm font-semibold text-slate-900'>
            {ticket.contactName || '-'}
          </p>
        </div>
        <div className='min-w-0 text-right sm:shrink-0'>
          <p className='text-[11px] text-slate-500'>Phone</p>
          <p className='inline-flex items-center gap-1 text-sm font-medium text-slate-700'>
            <Phone className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
            <span className='tabular-nums'>{ticket.contactPhone || '-'}</span>
          </p>
        </div>
      </div>

      <div className='mt-3 flex items-center justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-[11px] text-slate-500'>Technician</p>
          <p className='truncate text-sm font-medium text-slate-800'>
            {ticket.technicianName || (
              <span className='text-slate-400 italic'>Unassigned</span>
            )}
          </p>
          <p className='mt-0.5 text-xs text-slate-500'>
            Jenis tiket: {ticket.jenisTiket || '-'}
          </p>
        </div>

        {!isClosed && (
          <Button
            onClick={() => onAssign(ticket.idTicket)}
            className={`shrink-0 px-3 py-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] sm:px-4 sm:py-2 ${
              isAssigned
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isAssigned ? <RefreshCw size={14} /> : <UserPlus size={14} />}
            <span className='ml-1.5 hidden text-xs sm:inline sm:text-sm'>
              {isAssigned ? 'Reassign' : 'Assign'}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
