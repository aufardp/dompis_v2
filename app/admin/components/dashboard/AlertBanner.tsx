'use client';

interface ExpiredTicket {
  ticketId: string;
  customerType: string;
  reportedAt: Date;
  status: string;
  overdueHours: number;
  workzone?: string | null;
  idTicket?: number;
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
            <p className='mt-0.5 hidden text-xs text-(--text-secondary) sm:block'>
              Butuh segera di tindak lanjuti
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
        <span className='hidden text-(--text-secondary) sm:inline'>
          {new Date(ticket.reportedAt).toLocaleString('id-ID')}
        </span>
        <span className='text-red-400'>{ticket.status}</span>
        <span className='ml-auto hidden text-(--text-secondary) sm:inline'>
          🔄 Auto-refresh
        </span>
      </div>
    </div>
  );
}

interface DiamondAlertBannerProps {
  tickets: ExpiredTicket[];
  onAssign?: (ticketId: string, idTicket?: number) => void;
}

export function DiamondAlertBanner({
  tickets,
  onAssign,
}: DiamondAlertBannerProps) {
  if (tickets.length === 0) return null;

  return (
    <div
      className='animate-pulse-border rounded-xl border p-3 md:p-5'
      style={{
        background:
          'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.05))',
        borderColor: 'rgba(6,182,212,0.4)',
      }}
    >
      {/* Main Alert Row */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-start gap-2 sm:gap-3'>
          <span className='text-xl sm:text-2xl'>💎</span>
          <div>
            <p className='text-sm font-semibold text-cyan-400 md:text-base'>
              {tickets.length} Diamond Ticket Perlu Perhatian!
            </p>
            <p className='mt-0.5 hidden text-xs text-(--text-secondary) sm:block'>
              Customer Priority Highest - Segera tindak lanjuti
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 sm:flex-row'>
          <span className='font-syne self-start rounded-full bg-cyan-500 px-2 py-1 text-xs font-bold text-white sm:self-auto md:px-3 md:py-1'>
            💎 DIAMOND
          </span>
        </div>
      </div>

      {/* All Tickets List */}
      <div className='mt-3 space-y-2'>
        {tickets.map((ticket, index) => (
          <div
            key={ticket.ticketId || ticket.idTicket || index}
            className='flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/10 bg-cyan-500/5 px-3 py-2'
          >
            <span className='font-syne min-w-[100px] font-bold text-cyan-400'>
              {ticket.ticketId}
            </span>
            <span className='text-cyan-300'>⚡ {ticket.customerType}</span>
            {ticket.workzone && (
              <span className='text-cyan-300'>📍 {ticket.workzone}</span>
            )}
            <span className='text-cyan-300'>
              {new Date(ticket.reportedAt).toLocaleString('id-ID')}
            </span>
            <span className='font-medium text-cyan-400'>{ticket.status}</span>
            {onAssign && (
              <button
                onClick={() => onAssign(ticket.ticketId, ticket.idTicket)}
                className='ml-auto rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/25'
              >
                Assign
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
