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
import { isTicketClosed } from '@/app/libs/ticket-utils';

export default function TicketCardMobile({
  ticket,
  onAssign,
}: {
  ticket: any;
  onAssign: (ticketId: string | number) => void;
}) {
  const isAssigned = Boolean(ticket?.teknisiUserId);
  const isClosed = isTicketClosed(ticket.STATUS_UPDATE ?? ticket.hasilVisit);
  const maxTtr = getMaxTtr(ticket) || '-';

  return (
    <div className='group rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 dark:border-(--border) dark:bg-(--surface) dark:shadow-none'>
      <div className='flex items-start justify-between gap-2 sm:gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
            <p className='truncate text-sm font-semibold text-(--text-primary) dark:text-(--text-primary)'>
              {ticket.ticket || '-'}
            </p>
            <span className='text-xs text-(--text-secondary) dark:text-(--text-secondary)'>
              {formatDate(ticket.reportedDate)}
            </span>
          </div>
          <p className='mt-1 truncate text-sm text-(--text-primary) dark:text-(--text-primary)'>
            {ticket.summary || '-'}
          </p>
        </div>

        <div className='flex shrink-0 flex-col items-end gap-1'>
          <Badge size='sm' color={getStatusColor(ticket.STATUS_UPDATE ?? ticket.hasilVisit)}>
            {(ticket.STATUS_UPDATE ?? ticket.hasilVisit) || '-'}
          </Badge>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTicketAgeColorClass(ticket)}`}
          >
            {getTicketAge(ticket)}
          </span>
        </div>
      </div>

      <div className='mt-3 grid grid-cols-1 gap-2 text-xs text-(--text-primary) sm:grid-cols-2 dark:text-(--text-primary)'>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <Hash className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Service</p>
            <p className='truncate font-semibold text-(--text-primary) dark:text-(--text-primary)'>{ticket.serviceNo || '-'}</p>
            {ticket.ticketIdGamas && (
              <span className='mt-0.5 inline-block rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-400'>
                Gamas: +{ticket.ticketIdGamas}
              </span>
            )}
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <MapPin className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Workzone</p>
            <p className='truncate font-semibold text-(--text-primary) dark:text-(--text-primary)'>{ticket.workzone || '-'}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <User className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Type</p>
            <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <Clock3 className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Max TTR</p>
            <p className='truncate font-semibold text-(--text-primary) dark:text-(--text-primary)'>{maxTtr}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <Calendar className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Booking Date</p>
            <p className='truncate font-semibold text-(--text-primary) dark:text-(--text-primary)'>
              {ticket.bookingDate || '-'}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-xl bg-(--surface-2) px-2.5 py-2 dark:bg-(--surface-2)'>
          <MapPinned className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
          <div className='min-w-0'>
            <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Address</p>
            <p className='truncate font-semibold text-(--text-primary) dark:text-(--text-primary)'>{ticket.alamat || '-'}</p>
          </div>
        </div>
      </div>

      <div className='mt-3 flex flex-col gap-2 rounded-xl border border-(--border) bg-(--surface) p-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3 sm:py-2 dark:border-(--border) dark:bg-(--surface)'>
        <div className='min-w-0'>
          <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Customer</p>
          <p className='truncate text-sm font-semibold text-(--text-primary) dark:text-(--text-primary)'>
            {ticket.contactName || '-'}
          </p>
        </div>
        <div className='min-w-0 text-right sm:shrink-0'>
          <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Phone</p>
          <p className='inline-flex items-center gap-1 text-sm font-medium text-(--text-primary) dark:text-(--text-primary)'>
            <Phone className='h-3.5 w-3.5 text-(--text-secondary) sm:h-4 sm:w-4 dark:text-(--text-secondary)' />
            <span className='tabular-nums'>{ticket.contactPhone || '-'}</span>
          </p>
        </div>
      </div>

      <div className='mt-3 flex items-center justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-[11px] text-(--text-secondary) dark:text-(--text-secondary)'>Technician</p>
          <p className='truncate text-sm font-medium text-(--text-primary) dark:text-(--text-primary)'>
            {ticket.technicianName || (
              <span className='italic text-(--text-muted) dark:text-(--text-muted)'>Unassigned</span>
            )}
          </p>
          <p className='mt-0.5 text-xs text-(--text-secondary) dark:text-(--text-secondary)'>
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
