'use client';

import { useCallback, useState } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import NewTicketModal from '@/app/components/tickets/create/NewTicketModal';
import TicketTable from '@/app/components/tickets/TicketTable';
import AssignTechnicianModal from '@/app/components/tickets/assign/AssignTechnicianModal';
import Select from '@/app/components/form/Select';
import { useAdminTickets } from '@/app/hooks/useAdminTickets';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import TicketStats from '../components/tickets/TicketStats';
import CustomerTypeTabFilter from '@/app/components/tickets/CustomerTypeTabFilter';
import CustomerTypeBadge from '@/app/components/tickets/CustomerTypeBadge';
import TicketAgeAlarm from '@/app/components/tickets/TicketAgeAlarm';
import { TicketCtype } from '@/app/types/ticket';

interface TicketData {
  idTicket: number;
  ticketCode?: string;
  workzone?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number;
}

interface CtypeCounts {
  all: number;
  REGULER: number;
  HVC_GOLD: number;
  HVC_PLATINUM: number;
  HVC_DIAMOND: number;
}

export default function TicketPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ctypeFilter, setCtypeFilter] = useState<TicketCtype | 'all'>('all');
  const [ctypeCounts, setCtypeCounts] = useState<CtypeCounts>({
    all: 0,
    REGULER: 0,
    HVC_GOLD: 0,
    HVC_PLATINUM: 0,
    HVC_DIAMOND: 0,
  });
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );

  const { options: workzoneOptions, loading: workzoneLoading } =
    useWorkzoneOptions();

  const { tickets, loading, pagination, refresh } = useAdminTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
    ctypeFilter !== 'all' ? ctypeFilter : undefined,
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setCurrentPage(1);
  }, []);

  const handleCtypeChange = useCallback((ctype: TicketCtype | 'all') => {
    setCtypeFilter(ctype);
    setCurrentPage(1);
  }, []);

  const handleClearCtypeFilter = useCallback(() => {
    setCtypeFilter('all');
    setCurrentPage(1);
  }, []);

  const handleCtypeCountsChange = useCallback(
    (counts: Record<string, number>) => {
      setCtypeCounts({
        all: counts.all || 0,
        REGULER: counts.REGULER || 0,
        HVC_GOLD: counts.HVC_GOLD || 0,
        HVC_PLATINUM: counts.HVC_PLATINUM || 0,
        HVC_DIAMOND: counts.HVC_DIAMOND || 0,
      });
    },
    [],
  );

  const handleAssignClick = (ticketId: number | string) => {
    const ticket = tickets.find((t) => t.idTicket === ticketId);
    const techId = ticket?.teknisiUserId;
    setAssignModalTicket({
      idTicket: Number(ticketId),
      ticketCode: ticket?.ticket,
      workzone: ticket?.workzone ?? null,
      technicianName: ticket?.technicianName ?? null,
      teknisiUserId:
        techId !== undefined && techId !== null ? techId : undefined,
    });
  };

  return (
    <>
      <AdminLayout onSearch={handleSearch}>
        <div className='space-y-6 sm:space-y-8'>
          {/* HEADER ACTION */}
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl'>
              Ticket Management
            </h1>

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
              <div className='w-full sm:w-40 md:w-48'>
                <Select
                  options={workzoneOptions}
                  placeholder={workzoneLoading ? 'Loading...' : 'All Workzone'}
                  value={workzoneFilter}
                  onChange={handleWorkzoneChange}
                  disabled={workzoneLoading}
                />
              </div>

              <button
                onClick={() => setShowNewTicketModal(true)}
                className='w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto sm:px-4'
              >
                + New Ticket
              </button>
            </div>
          </div>

          {/* TICKET AGE ALARM */}
          <TicketAgeAlarm
            onTicketClick={(ticketId) => {
              const ticket = tickets.find((t) => t.idTicket === ticketId);
              if (ticket?.teknisiUserId) {
                setAssignModalTicket({
                  idTicket: ticketId,
                  ticketCode: ticket.ticket,
                  workzone: ticket.workzone ?? null,
                  technicianName: ticket.technicianName ?? null,
                  teknisiUserId: ticket.teknisiUserId,
                });
              }
            }}
          />

          {/* CUSTOMER TYPE FILTER */}
          <div className='flex flex-col gap-3'>
            <CustomerTypeTabFilter
              activeType={ctypeFilter}
              onChange={handleCtypeChange}
              counts={ctypeCounts}
            />

            {/* ACTIVE FILTER INDICATOR */}
            {ctypeFilter !== 'all' && (
              <div className='flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 sm:px-4'>
                <span className='text-sm text-blue-700'>Filter aktif:</span>
                <CustomerTypeBadge ctype={ctypeFilter} size='sm' />
                <button
                  onClick={handleClearCtypeFilter}
                  className='ml-auto rounded-full p-1 text-blue-600 hover:bg-blue-100 sm:ml-0'
                >
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M6 18L18 6M6 6l12 12'
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* STATS */}
          <TicketStats
            workzone={workzoneFilter || undefined}
            ctype={ctypeFilter !== 'all' ? ctypeFilter : undefined}
            onCtypeChange={handleCtypeChange}
            onCountsChange={handleCtypeCountsChange}
          />

          <TicketTable
            tickets={tickets}
            loading={loading}
            onAssign={handleAssignClick}
            pagination={{
              ...pagination,
              onPageChange: setCurrentPage,
            }}
          />
          {/* DEBUG */}
          <div className='debug hidden'>
            <pre>
              {JSON.stringify({ tickets, loading, pagination }, null, 2)}
            </pre>
          </div>
        </div>
      </AdminLayout>

      <NewTicketModal
        isOpen={showNewTicketModal}
        onClose={() => setShowNewTicketModal(false)}
        onCreated={refresh}
      />

      {assignModalTicket && (
        <AssignTechnicianModal
          ticketId={assignModalTicket.idTicket}
          ticketCode={assignModalTicket.ticketCode}
          ticketWorkzone={assignModalTicket.workzone}
          currentTechnicianId={assignModalTicket.teknisiUserId}
          currentTechnicianName={assignModalTicket.technicianName}
          isOpen
          onClose={() => setAssignModalTicket(null)}
          onAssign={async () => {
            await refresh();
            setAssignModalTicket(null);
          }}
        />
      )}
    </>
  );
}
