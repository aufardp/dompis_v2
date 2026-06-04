'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { queryKeys } from '@/app/libs/query-keys';
import TicketTable from './TicketTable';
import TicketTableTabs from './TicketTableTabs';
import { FilterBarB2B } from './filterbarb2b';

const AssignTechnicianModal = dynamic(
  () => import('@/app/admin/components/dashboard/assign/AssignTechnicianModal'),
  { ssr: false, loading: () => null },
);

type TicketData = {
  idTicket: number;
  ticketCode?: string;
  workzone?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number;
};

export default function NonTechnicalBucketPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string[]>([]);
  const [statusUpdateFilter, setStatusUpdateFilter] = useState<string[]>([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string[]>([]);
  const [flaggingFilter, setFlaggingFilter] = useState<string[]>([]);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(null);
  const [validasiPage, setValidasiPage] = useState(1);

  const {
    tickets,
    pagination,
    summary,
    loading,
    isRefreshing,
    ticketTypeOptions,
    validasiTickets,
    validasiCount,
    validasiPagination,
  } = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'all',
    operationalBucket: ['non_technical'],
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: ticketStatusFilter,
    flagging: flaggingFilter,
    page,
    limit: 10,
    validasiPage,
    includeValidasi: true,
  });

  const tableSummary = useMemo(() => ({
    total: pagination?.total ?? tickets.length,
    open: summary?.open ?? 0,
    assigned: summary?.assigned ?? 0,
    close: summary?.close ?? 0,
  }), [pagination?.total, tickets.length, summary?.open, summary?.assigned, summary?.close]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const onAssign = useCallback((ticketId: string | number) => {
    const ticket = tickets.find((t) => String(t.idTicket) === String(ticketId));
    setAssignModalTicket({
      idTicket: Number(ticketId),
      ticketCode: ticket?.ticket,
      workzone: ticket?.workzone ?? null,
      technicianName: ticket?.technicianName ?? null,
      teknisiUserId: ticket?.teknisiUserId ?? undefined,
    });
  }, [tickets]);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (query.queryKey[0] === queryKeys.tickets.all[0] ||
          query.queryKey[0] === queryKeys.dashboard.all[0]),
      refetchType: 'active',
    });
  }, [queryClient]);

  const paginationConfig = pagination
    ? {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        total: pagination.total,
        limit: pagination.limit,
        onPageChange: handlePageChange,
      }
    : undefined;

  return (
    <>
      <AdminLayout
        onSearch={handleSearch}
        onWorkzoneChange={handleWorkzoneChange}
        selectedWorkzone={workzoneFilter}
      >
        <div className='space-y-5'>
          <div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'>
            <div className='bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.08),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_28%)] p-5'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-xl text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'>
                    🔧
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-xs font-bold tracking-[1.5px] text-slate-400 uppercase dark:text-slate-500'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-2xl font-black text-slate-900 dark:text-slate-100'>
                      Non Technical
                    </h1>
                    <p className='mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400'>
                      Ticket Non-Technical ditampilkan dalam satu tabel. Filter di bawah dipakai untuk menyaring jenis tiket dan status tiket langsung dari data tabel.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-4 gap-3 lg:min-w-[320px]'>
                  <div className='col-span-4 rounded-2xl border border-slate-200 bg-white/85 p-3 text-center dark:border-slate-800 dark:bg-slate-900/80'>
                    <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                      Total
                    </p>
                    <p className='mt-1 text-xl font-black text-slate-900 dark:text-slate-100'>
                      {pagination?.total ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950'>
            <FilterBarB2B
              ticketType={ticketTypeFilter}
              ticketTypeOptions={ticketTypeOptions}
              statusUpdate={statusUpdateFilter}
              ticketStatus={ticketStatusFilter}
              flagging={flaggingFilter}
              onTypeChange={(types) => {
                setTicketTypeFilter(types);
                setPage(1);
              }}
              onStatusChange={(statuses) => {
                setStatusUpdateFilter(statuses);
                setPage(1);
              }}
              onTicketStatusChange={(statuses) => {
                setTicketStatusFilter(statuses);
                setPage(1);
              }}
              onFlaggingChange={(flags) => {
                setFlaggingFilter(flags);
                setPage(1);
              }}
            />
          </div>

          <TicketTableTabs
            section='non-technical'
            accentColor='#e11d48'
            mainTable={
              <TicketTable
                tickets={tickets}
                loading={loading}
                isRefreshing={isRefreshing}
                onAssign={onAssign}
                pagination={paginationConfig}
                tableLabel='Non Technical Tickets'
                tableSummary={tableSummary}
                downloadFilters={{
                  dept: 'all',
                  operationalBucket: ['non_technical'],
                  ticketType: ticketTypeFilter,
                  statusUpdate: statusUpdateFilter,
                  ticketStatus: ticketStatusFilter,
                  flagging: flaggingFilter,
                }}
              />
            }
            tickets={tickets}
            validasiTickets={validasiTickets}
            totalCount={pagination?.total}
            validasiTotalCount={validasiCount}
            validasiPagination={{
              currentPage: validasiPagination.currentPage,
              totalPages: validasiPagination.totalPages,
              total: validasiPagination.total,
              limit: validasiPagination.limit,
              onPageChange: setValidasiPage,
            }}
            loading={loading}
            isRefreshing={isRefreshing}
            onAssign={onAssign}
          />
        </div>
      </AdminLayout>

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
            await new Promise((resolve) => setTimeout(resolve, 300));
            setAssignModalTicket(null);
            invalidateQueries();
          }}
        />
      )}
    </>
  );
}
