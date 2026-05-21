'use client';

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

// Konfigurasi warna border kiri (Gunakan UPPERCASE agar aman setelah normalisasi)
const STATUS_BORDER_COLORS: Record<string, string> = {
  ASSIGNED: 'border-l-amber-500 dark:border-l-amber-600',
  ON_PROGRESS: 'border-l-blue-500 dark:border-l-blue-600',
  PENDING: 'border-l-purple-500 dark:border-l-purple-600',
  CLOSED: 'border-l-green-500 dark:border-l-green-600',
  CLOSE: 'border-l-green-500 dark:border-l-green-600',
};

// Konfigurasi Badge Status Utama di Header
const STATUS_BADGE_MAP: Record<
  string,
  { badge: string; dot: string; label: string }
> = {
  ASSIGNED: {
    badge:
      'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    dot: 'bg-amber-500',
    label: 'Menunggu',
  },
  ON_PROGRESS: {
    badge:
      'bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    dot: 'bg-blue-500',
    label: 'Dikerjakan',
  },
  PENDING: {
    badge:
      'bg-purple-50 text-purple-700 border-purple-200/70 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
    dot: 'bg-purple-500',
    label: 'Pending',
  },
  CLOSED: {
    badge:
      'bg-green-50 text-green-700 border-green-200/70 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
    dot: 'bg-green-500',
    label: 'Selesai',
  },
  CLOSE: {
    badge:
      'bg-green-50 text-green-700 border-green-200/70 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
    dot: 'bg-green-500',
    label: 'Selesai',
  },
};

// Konfigurasi Action Badge di Footer (Sudah digabung Light + Dark Mode agar tidak bug)
const ACTION_BADGE_MAP: Record<
  string,
  { classes: string; icon: string; text: string }
> = {
  ASSIGNED: {
    classes:
      'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    icon: '⏳',
    text: 'Siap Dikerjakan',
  },
  ON_PROGRESS: {
    classes: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    icon: '🔧',
    text: 'Sedang Dikerjakan',
  },
  PENDING: {
    classes:
      'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
    icon: '⏸',
    text: 'Pending',
  },
  CLOSED: {
    classes:
      'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    icon: '✓',
    text: 'Selesai',
  },
  CLOSE: {
    classes:
      'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    icon: '✓',
    text: 'Selesai',
  },
};

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('62') || cleaned.startsWith('0')) {
    const num = cleaned.startsWith('62') ? cleaned.slice(2) : cleaned.slice(1);
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
  // Normalisasi Status menjadi UPPERCASE
  const status = (ticket.hasilVisit ?? ticket.status_update ?? '')
    .toUpperCase()
    .trim();
  const isClosed = isTicketClosed(ticket.status_update);

  // Penentuan Key Akhir (Jika closed paksa ke 'CLOSED')
  const activeKey = isClosed ? 'CLOSED' : status;

  // Mengambil styles berdasarkan status yang ter-normalisasi
  const borderLeftClass =
    STATUS_BORDER_COLORS[activeKey] ||
    'border-l-slate-300 dark:border-l-slate-600';
  const statusBadge = STATUS_BADGE_MAP[activeKey] || {
    badge:
      'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-700',
    dot: 'bg-slate-400',
    label: status,
  };
  const actionBadge = ACTION_BADGE_MAP[activeKey];
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
      className={`group cursor-pointer rounded-xl border border-l-4 border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl sm:p-5 dark:border-slate-700/60 dark:bg-slate-800 ${borderLeftClass} `}
    >
      <div className='flex flex-col gap-2.5 sm:gap-3.5'>
        {/* TOP ROW: Incident Number & Arrow */}
        <div className='flex items-center justify-between'>
          <span className='font-mono text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500'>
            {ticket.ticket}
          </span>
          <svg
            className='h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-slate-600'
            fill='none'
            stroke='currentColor'
            strokeWidth={2.5}
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M9 5l7 7-7 7'
            />
          </svg>
        </div>

        {/* BADGES ROW */}
        <div className='flex flex-wrap items-center gap-1.5'>
          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${statusBadge.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
            {statusBadge.label}
          </span>

          {/* Jenis Tiket Badge */}
          {ticket.jenisTiket && (
            <span className='inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'>
              <svg
                className='h-3 w-3 text-slate-400 dark:text-slate-500'
                fill='none'
                viewBox='0 0 24 24'
                strokeWidth='2.5'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a2.25 2.25 0 0 0 3.182 0l4.318-4.318a2.25 2.25 0 0 0 0-3.182L11.16 3.659A2.25 2.25 0 0 0 9.568 3Z'
                />
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M6 6h.008v.008H6V6Z'
                />
              </svg>
              <span className='capitalize'>
                {ticket.jenisTiket.toLowerCase()}
              </span>
            </span>
          )}

          {/* Umur Tiket Badge */}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${TICKET_AGE_COLORS[ageColor] || TICKET_AGE_COLORS.gray}`}
          >
            {calculateTicketAge(
              ticket.reportedDate,
              ticket.hasilVisit,
              ticket.closedAt,
            )}
          </span>
        </div>

        {/* TICKET TITLE */}
        <h3 className='line-clamp-2 text-sm leading-snug font-bold text-slate-800 sm:text-base dark:text-slate-100'>
          {title}
        </h3>

        {/* INFO GRID */}
        <div className='flex flex-col text-xs'>
          {/* Row 1: Pelanggan + Telepon */}
          <div className='flex items-start justify-between border-b border-slate-100/70 py-2 dark:border-slate-700/40'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                Pelanggan
              </p>
              <p className='truncate font-semibold text-slate-800 uppercase dark:text-slate-100'>
                {ticket.contactName || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                Telepon
              </p>
              {ticket.contactPhone ? (
                <a
                  href={`https://wa.me/${ticket.contactPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={handleWhatsAppClick}
                  className='inline-flex max-w-35 items-center gap-1 truncate font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300'
                >
                  <svg
                    className='h-3.5 w-3.5 shrink-0'
                    fill='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
                  </svg>
                  <span className='border-b border-dotted border-emerald-500/40 pb-0.5 leading-none'>
                    {formatPhoneNumber(ticket.contactPhone)}
                  </span>
                </a>
              ) : (
                <p className='font-semibold text-slate-400 dark:text-slate-500'>
                  -
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Alamat */}
          <div className='border-b border-slate-100/70 py-2 dark:border-slate-700/40'>
            <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
              Alamat
            </p>
            <p className='line-clamp-2 font-semibold text-slate-700 dark:text-slate-200'>
              {ticket.alamat || '-'}
            </p>
          </div>

          {/* Row 3: Customer Type + No. Service */}
          <div className='flex items-start justify-between border-b border-slate-100/70 py-2 dark:border-slate-700/40'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                Customer Type
              </p>
              <p className='font-semibold text-slate-800 dark:text-slate-100'>
                {formatCustomerType(ticket.customerType) || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                No. Service
              </p>
              <div className='inline-flex flex-wrap items-center justify-end gap-1.5'>
                <p className='font-semibold text-slate-800 dark:text-slate-100'>
                  {ticket.serviceNo || '-'}
                </p>
                {ticket.ticketIdGamas && (
                  <span className='rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400'>
                    GAMAS +{ticket.ticketIdGamas}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row 4: Jenis Layanan + Device */}
          <div className='flex items-start justify-between border-b border-slate-100/70 py-2 dark:border-slate-700/40'>
            <div className='min-w-0 flex-1 pr-3'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                Jenis Layanan
              </p>
              <p className='font-semibold text-slate-800 dark:text-slate-100'>
                {ticket.serviceType || '-'}
              </p>
            </div>
            <div className='min-w-0 text-right'>
              <p className='mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                Device
              </p>
              <p className='font-semibold text-slate-800 dark:text-slate-100'>
                {ticket.deviceName || '-'}
              </p>
            </div>
          </div>

          {/* Row 5: Max TTR Highlight */}
          <div className='mt-2.5 flex items-center justify-between rounded-lg border border-orange-200/80 bg-orange-50/60 px-2.5 py-1.5 dark:border-orange-500/20 dark:bg-orange-500/10'>
            <span className='inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-orange-600 uppercase dark:text-orange-400'>
              <span>⚠️</span> Max TTR
            </span>
            <span className='font-bold text-orange-700 dark:text-orange-300'>
              {getMaxTtrInfo(ticket)}
            </span>
          </div>
        </div>

        {/* FOOTER ACTION */}
        <div className='mt-1 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-700/50'>
          <div className='text-[11px] font-medium text-slate-400 transition-colors group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400'>
            Klik untuk detail tiket
          </div>

          {actionBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold tracking-wide transition-all ${actionBadge.classes}`}
            >
              <span>{actionBadge.icon}</span>
              <span>{actionBadge.text}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
