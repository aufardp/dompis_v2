import {
  RefreshCw,
  UserPlus,
  ShieldAlert,
  MapPin,
  Phone,
  Hash,
  Clock3,
  User,
} from 'lucide-react';
import { memo, useState } from 'react';
import clsx from 'clsx';
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
import { useRouter } from 'next/navigation';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import BypassCloseModal from '@/app/admin/components/dashboard/BypassCloseModal';
import { useAdminToast } from '@/app/admin/components/dashboard/admin-toast';

function TicketCardMobile({
  ticket,
  onAssign,
  highlighted = false,
  showBypassClose = false,
}: {
  ticket: any;
  onAssign: (ticketId: string | number) => void;
  highlighted?: boolean;
  showBypassClose?: boolean;
}) {
  const statusValue = ticket.status_update ?? ticket.hasilVisit;
  const isAssigned = Boolean(ticket?.teknisiUserId);
  const isClosed = isTicketClosed(statusValue);
  const maxTtr = getMaxTtr(ticket) || '-';
  const [bypassModalOpen, setBypassModalOpen] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);
  const { showSuccess, showError } = useAdminToast();
  const router = useRouter();

  const handleBypassClose = async () => {
    if (!ticket.idTicket || bypassLoading) return;

    setBypassLoading(true);
    try {
      const res = await fetch('/api/tickets/bypass-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.success) {
        showError(
          'Bypass close gagal',
          payload?.message ?? 'Ticket tidak berhasil di-bypass close.',
        );
        return;
      }

      showSuccess(
        'Bypass close berhasil',
        ticket.ticket ? `Ticket ${ticket.ticket} sudah masuk validasi.` : 'Ticket sudah masuk validasi.',
        { persist: true },
      );
      router.refresh();
    } catch (e) {
      console.error('Bypass close error:', e);
      showError(
        'Bypass close gagal',
        'Terjadi kesalahan saat memproses bypass close.',
      );
    } finally {
      setBypassLoading(false);
      setBypassModalOpen(false);
    }
  };

  return (
    <div
      className={clsx(
        'group rounded-3xl border bg-(--surface) p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 scroll-mt-28',
        highlighted
          ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 dark:border-blue-300/40 dark:bg-blue-500/10 dark:ring-blue-400/20'
          : 'border-(--border)',
      )}
      data-search-highlight={highlighted ? 'true' : undefined}
    >
      <div className='flex items-start justify-between gap-2 sm:gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
            <p className='truncate text-sm font-semibold text-(--text-primary)'>
              {ticket.ticket || '-'}
            </p>
            {highlighted && (
              <span className='rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white uppercase shadow-sm'>
                hasil search
              </span>
            )}
            <span className='text-xs text-(--text-secondary)'>
              {formatDate(ticket.reportedDate)}
            </span>
          </div>
          <p className='mt-1 truncate text-sm text-(--text-secondary)'>
            {ticket.summary || '-'}
          </p>
          {ticket.alamat && (
            <p className='mt-1 line-clamp-1 text-[11px] text-(--text-muted)'>
              {ticket.alamat}
            </p>
          )}
        </div>

        <div className='flex shrink-0 flex-col items-end gap-1'>
          <Badge size='sm' color={getStatusColor(statusValue)}>
            {statusValue || '-'}
          </Badge>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTicketAgeColorClass(ticket)}`}
          >
            {getTicketAge(ticket)}
          </span>
        </div>
      </div>

      <div className='mt-3 grid grid-cols-1 gap-2 text-xs text-(--text-primary) sm:grid-cols-2'>
        <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
          <Hash className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Service</p>
            <p className='truncate font-semibold text-(--text-primary)'>{ticket.serviceNo || '-'}</p>
            {ticket.ticketIdGamas && (
              <span className='mt-0.5 inline-block rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-400'>
                Gamas: +{ticket.ticketIdGamas}
              </span>
            )}
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
          <MapPin className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Workzone</p>
            <p className='truncate font-semibold text-(--text-primary)'>{ticket.workzone || '-'}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
          <User className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Type</p>
            <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
          <Clock3 className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
          <div className='min-w-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Max TTR</p>
            <p className='truncate font-semibold text-(--text-primary)'>{maxTtr}</p>
          </div>
        </div>
      </div>

      <div className='mt-3 flex flex-col gap-2 rounded-2xl border border-(--border) bg-(--bg) p-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3 sm:py-2'>
        <div className='min-w-0'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Customer</p>
          <p className='truncate text-sm font-semibold text-(--text-primary)'>
            {ticket.contactName || '-'}
          </p>
        </div>
        <div className='min-w-0 text-right sm:shrink-0'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Phone</p>
          <p className='inline-flex items-center gap-1 text-sm font-medium text-(--text-primary)'>
            <Phone className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
            <span className='tabular-nums'>{ticket.contactPhone || '-'}</span>
          </p>
        </div>
      </div>

      <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0 flex-1'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)'>Technician</p>
          <p className='truncate text-sm font-medium text-(--text-primary)'>
            {ticket.technicianName || (
              <span className='italic text-(--text-muted)'>Unassigned</span>
            )}
          </p>
          <p className='mt-0.5 text-xs text-(--text-secondary)'>
            Jenis tiket: {ticket.jenisTiket || '-'}
          </p>
        </div>

        {!isClosed && (
          <div className='flex gap-2 sm:shrink-0'>
            {showBypassClose && (
              <Button
                onClick={() => setBypassModalOpen(true)}
                className='shrink-0 border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 transition-all duration-200 hover:scale-[1.02] hover:bg-amber-100 active:scale-[0.98] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20'
              >
                <ShieldAlert size={14} />
                <span className='ml-1.5 hidden text-xs sm:inline sm:text-sm'>
                  Bypass Close
                </span>
              </Button>
            )}
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
          </div>
        )}
      </div>

      <BypassCloseModal
        open={bypassModalOpen}
        onClose={() => setBypassModalOpen(false)}
        onConfirm={handleBypassClose}
        ticketCode={ticket.ticket}
        loading={bypassLoading}
      />
    </div>
  );
}

export default memo(TicketCardMobile);
