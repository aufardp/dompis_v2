// app/teknisi/components/TeknisiDashboard/components/TicketCard.tsx

import { Ticket } from '@/app/types/ticket';
import { calculateTicketAge, getTicketAgeColor } from '@/app/utils/datetime';
import { getMaxTtrInfo } from '../utils/ttr';
import { TICKET_AGE_COLORS } from '../constants/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
}

const STATUS_BORDER_COLORS: Record<string, string> = {
  // STATUS_UPDATE lowercase values
  assigned: 'border-l-amber-400',
  on_progress: 'border-l-blue-500',
  pending: 'border-l-purple-400',
  closed: 'border-l-green-500',
  // Legacy HASIL_VISIT uppercase fallback
  ASSIGNED: 'border-l-amber-400',
  ON_PROGRESS: 'border-l-blue-500',
  PENDING: 'border-l-purple-400',
  CLOSE: 'border-l-green-500',
};

const STATUS_ACTION_COLORS: Record<
  string,
  { bg: string; text: string; icon: string }
> = {
  // STATUS_UPDATE lowercase values
  assigned: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '⏳' },
  on_progress: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '🔧' },
  pending: { bg: 'bg-purple-50', text: 'text-purple-700', icon: '⏸' },
  closed: { bg: 'bg-green-50', text: 'text-green-700', icon: '✓' },
  // Legacy HASIL_VISIT uppercase fallback
  ASSIGNED: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '⏳' },
  ON_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '🔧' },
  PENDING: { bg: 'bg-purple-50', text: 'text-purple-700', icon: '⏸' },
  CLOSE: { bg: 'bg-green-50', text: 'text-green-700', icon: '✓' },
};

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    const num = cleaned.slice(2);
    if (num.length >= 8) {
      return `+62 ${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7)}`;
    }
    return `+62 ${num}`;
  }
  if (cleaned.startsWith('0')) {
    const num = cleaned.slice(1);
    if (num.length >= 8) {
      return `+62 ${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7)}`;
    }
    return `+62 ${num}`;
  }
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function formatCustomerType(raw?: string | null): string {
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper.includes('DIAMOND')) return 'HVC Diamond';
  if (upper.includes('PLATINUM')) return 'HVC Platinum';
  if (upper.includes('GOLD')) return 'HVC Gold';
  if (upper.includes('REGULER') || upper.includes('REGULAR')) return 'Reguler';
  return raw;
}

export default function TicketCard({ ticket, onClick }: TicketCardProps) {
  const status = (ticket.hasilVisit ?? ticket.STATUS_UPDATE ?? '')
    .toUpperCase()
    .trim();
  const isClosed = isTicketClosed(ticket.STATUS_UPDATE);
  const borderColor = isClosed
    ? 'border-l-green-500'
    : STATUS_BORDER_COLORS[status] || 'border-l-slate-300';
  const actionColor = isClosed
    ? STATUS_ACTION_COLORS['closed']
    : STATUS_ACTION_COLORS[status];
  const ageColor = getTicketAgeColor(
    ticket.reportedDate,
    ticket.hasilVisit,
    ticket.closedAt,
  );

  const title =
    ticket.summary || ticket.symptom || ticket.ticket || 'Tanpa deskripsi';

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onClick={() => onClick(ticket)}
      className={`group cursor-pointer rounded-xl border border-l-4 border-slate-200 ${borderColor} bg-white px-2.5 py-2.5 shadow-sm transition-all hover:shadow-md sm:rounded-2xl sm:p-5`}
    >
      <div className='flex flex-col gap-2 sm:gap-3'>
        {/* Incident Number */}
        <div className='flex items-center justify-between'>
          <span className='font-mono text-[14px] font-bold text-slate-500'>
            {ticket.ticket}
          </span>
          <svg
            className='h-3.5 w-3.5 shrink-0 text-slate-400'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M9 5l7 7-7 7'
            />
          </svg>
        </div>

        {/* HEADER - Badges */}
        <div className='flex flex-wrap items-center gap-1'>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              isClosed
                ? 'border-green-200 bg-green-100 text-green-700'
                : status === 'ASSIGNED'
                  ? 'border-amber-200 bg-amber-100 text-amber-700'
                  : status === 'ON_PROGRESS'
                    ? 'border-blue-200 bg-blue-100 text-blue-700'
                    : status === 'PENDING'
                      ? 'border-purple-200 bg-purple-100 text-purple-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
            }`}
          >
            {isClosed
              ? 'Selesai'
              : status === 'ASSIGNED'
                ? 'Menunggu'
                : status === 'ON_PROGRESS'
                  ? 'Dikerjakan'
                  : status === 'PENDING'
                    ? 'Pending'
                    : status}
          </span>
          {ticket.jenisTiket && (
            <span className='shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600'>
              {ticket.jenisTiket}
            </span>
          )}
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              TICKET_AGE_COLORS[ageColor] || TICKET_AGE_COLORS.gray
            }`}
          >
            {calculateTicketAge(
              ticket.reportedDate,
              ticket.hasilVisit,
              ticket.closedAt,
            )}
          </span>
        </div>

        {/* TITLE */}
        <h3 className='line-clamp-2 text-sm font-bold text-slate-800 sm:text-lg'>
          {title}
        </h3>

        {/* CONTENT - Info Grid */}
        <div className='flex flex-col'>
          {/* Row 1: Pelanggan + Telepon */}
          <div className='flex items-start justify-between border-b border-slate-100 py-2'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                Pelanggan
              </p>
              <p className='truncate text-xs font-semibold text-slate-800 uppercase sm:text-sm'>
                {ticket.contactName || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                Telepon
              </p>
              {ticket.contactPhone ? (
                <a
                  href={`https://wa.me/${ticket.contactPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={handleWhatsAppClick}
                  className='inline-flex items-center gap-0.5 text-[13px] font-semibold break-all text-emerald-600 hover:text-emerald-700 sm:text-sm'
                >
                  <svg
                    className='h-3 w-3 shrink-0'
                    fill='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
                  </svg>
                  <span className='leading-tight'>
                    {formatPhoneNumber(ticket.contactPhone)}
                  </span>
                </a>
              ) : (
                <p className='text-xs font-semibold text-slate-400'>-</p>
              )}
            </div>
          </div>

          {/* Row 2: Alamat (full width) */}
          <div className='border-b border-slate-100 py-2'>
            <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
              Alamat
            </p>
            <p className='line-clamp-2 text-xs font-semibold text-slate-700 sm:text-sm'>
              {ticket.alamat || '-'}
            </p>
          </div>

          {/* Row 3: Customer Type + No. Service */}
          <div className='flex items-start justify-between border-b border-slate-100 py-2'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                Customer Type
              </p>
              <p className='text-xs font-semibold text-slate-800 sm:text-sm'>
                {formatCustomerType(ticket.customerType) || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                No. Service
              </p>
              <p className='text-xs font-semibold text-slate-800 sm:text-sm'>
                {ticket.serviceNo || '-'}
              </p>
            </div>
          </div>

          {/* Row 4: Jenis Layanan + Device */}
          <div className='flex items-start justify-between border-b border-slate-100 py-2'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                Jenis Layanan
              </p>
              <p className='text-xs font-semibold text-slate-800 sm:text-sm'>
                {ticket.serviceType || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase'>
                Device
              </p>
              <p className='text-xs font-semibold text-slate-800 sm:text-sm'>
                {ticket.deviceName || '-'}
              </p>
            </div>
          </div>

          {/* Row 5: Max TTR - Highlighted */}
          <div className='mt-1 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5'>
            <span className='text-[9px] font-bold tracking-wide text-orange-500 uppercase'>
              ⚠ Max TTR
            </span>
            <span className='text-xs font-bold text-orange-700 sm:text-sm'>
              {getMaxTtrInfo(ticket)}
            </span>
          </div>
        </div>

        {/* ACTION FOOTER */}
        <div className='mt-1 flex items-center justify-between border-t border-slate-100 pt-2'>
          <div className='text-[10px] text-slate-400'>Klik untuk detail</div>

          {actionColor && (
            <span
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${actionColor.bg} ${actionColor.text}`}
            >
              {actionColor.icon}{' '}
              {actionColor.text === 'text-amber-700'
                ? 'Siap Dikerjakan'
                : actionColor.text === 'text-blue-700'
                  ? 'Sedang Dikerjakan'
                  : actionColor.text === 'text-purple-700'
                    ? 'Pending'
                    : 'Selesai'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
