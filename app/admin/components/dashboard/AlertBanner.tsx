'use client';

interface ExpiredTicket {
  ticketId: string;
  customerType: string;
  reportedAt: Date;
  status: string;
  overdueHours: number;
}

interface AlertBannerProps {
  tickets: ExpiredTicket[];
}

export function AlertBanner({ tickets }: AlertBannerProps) {
  if (tickets.length === 0) return null;

  const ticket = tickets[0];

  return (
    <div
      className='animate-pulse-border rounded-xl border p-3 md:p-5'
      style={{
        background:
          'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
        borderColor: 'rgba(239,68,68,0.3)',
      }}
    >
      {/* Main Alert Row */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-start gap-2 sm:gap-3'>
          <span className='text-xl sm:text-2xl'>⚠️</span>
          <div>
            <p className='text-sm font-semibold text-red-400 md:text-base'>
              {tickets.length} Expired Ticket Terdeteksi
            </p>
            <p className='mt-0.5 hidden text-xs text-[var(--text-secondary)] sm:block'>
              Segera tindak lanjuti sebelum SLA breach meluas
            </p>
          </div>
        </div>
        <span className='font-syne self-start rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white sm:self-auto md:px-3 md:py-1'>
          {ticket.overdueHours}h OVERDUE
        </span>
      </div>

      {/* Detail Row - hidden on very small screens */}
      <div
        className='mt-2 flex flex-wrap items-center gap-2 pt-2 text-xs sm:mt-3 sm:gap-4'
        style={{ borderTop: '1px solid rgba(239,68,68,0.15)' }}
      >
        <span className='font-syne font-bold text-red-400'>
          {ticket.ticketId}
        </span>
        <span className='text-amber-400'>⚡ {ticket.customerType}</span>
        <span className='hidden text-[var(--text-secondary)] sm:inline'>
          {new Date(ticket.reportedAt).toLocaleString('id-ID')}
        </span>
        <span className='text-red-400'>{ticket.status}</span>
        <span className='ml-auto hidden text-[var(--text-secondary)] sm:inline'>
          🔄 Auto-refresh
        </span>
      </div>
    </div>
  );
}
