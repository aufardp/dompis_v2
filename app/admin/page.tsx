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

interface TicketData {
  idTicket: number;
  teknisiUserId?: number;
}

export default function TicketPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );

  const { options: workzoneOptions } = useWorkzoneOptions();

  const { tickets, loading, pagination, refresh } = useAdminTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setCurrentPage(1);
  }, []);

  const handleAssignClick = (ticketId: number | string) => {
    const ticket = tickets.find((t) => t.idTicket === ticketId);
    const techId = ticket?.teknisiUserId;
    setAssignModalTicket({
      idTicket: Number(ticketId),
      teknisiUserId:
        techId !== undefined && techId !== null ? techId : undefined,
    });
  };

  return (
    <>
      <AdminLayout onSearch={handleSearch}>
        <div className='space-y-8'>
          {/* HEADER ACTION */}
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <h1 className='text-2xl font-semibold text-gray-800'>
              Ticket Management
            </h1>

            <div className='flex flex-wrap items-center gap-3'>
              <div className='w-full sm:w-48'>
                <Select
                  options={workzoneOptions}
                  placeholder='All Workzone'
                  value={workzoneFilter}
                  onChange={handleWorkzoneChange}
                />
              </div>

              <button
                onClick={() => setShowNewTicketModal(true)}
                className='w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto'
              >
                + New Ticket
              </button>
            </div>
          </div>

          {/* STATS */}
          <TicketStats workzone={workzoneFilter || undefined} />

          <TicketTable
            tickets={tickets}
            loading={loading}
            onAssign={handleAssignClick}
            pagination={{
              ...pagination,
              onPageChange: setCurrentPage,
            }}
          />
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
          currentTechnicianId={assignModalTicket.teknisiUserId}
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
