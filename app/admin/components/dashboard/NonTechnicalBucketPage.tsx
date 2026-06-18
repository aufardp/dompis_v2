'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { queryKeys } from '@/app/libs/query-keys';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
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
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string[]>([]);
  const [statusUpdateFilter, setStatusUpdateFilter] = useState<string[]>([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string[]>([]);
  const [flaggingFilter, setFlaggingFilter] = useState<string[]>([]);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(null);
  const [validasiPage, setValidasiPage] = useState(1);
  const [closePage, setClosePage] = useState(1);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

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

  const closePageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'all',
    operationalBucket: ['non_technical'],
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: CLOSE_STATUS_VALUES,
    flagging: flaggingFilter,
    page: closePage,
    limit: 10,
    includeValidasi: false,
  });

  const tableSummary = useMemo(() => ({
    total: pagination?.total ?? tickets.length,
    open: summary?.open ?? 0,
    assigned: summary?.assigned ?? 0,
    close: summary?.close ?? 0,
  }), [pagination?.total, tickets.length, summary?.open, summary?.assigned, summary?.close]);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setPage(1);
    setClosePage(1);
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
        onWorkzoneChange={handleWorkzoneChange}
        selectedWorkzone={workzoneFilter}
      >
        <div className='space-y-5'>
          <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
            <div className='bg-[linear-gradient(180deg,rgba(255,241,242,0.72),rgba(255,255,255,0.96))] p-3.5 md:p-4 dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(17,24,39,0.8))]'>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                <div className='flex items-start gap-2.5'>
                  <div className='grid h-10 w-10 place-items-center rounded-2xl border border-(--border) bg-(--bg) text-[0.95rem] font-black text-rose-600 shadow-sm'>
                    NT
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-[10px] font-bold tracking-[0.24em] text-(--text-secondary) uppercase'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-[1.35rem] leading-none font-black tracking-[-0.03em] text-(--text-primary) md:text-[1.6rem]'>
                      Non Technical
                    </h1>
                    <p className='mt-1.5 max-w-2xl text-[13px] leading-5 text-(--text-secondary)'>
                      Bucket reason-based untuk analisis non teknis, dengan filter
                      jenis tiket, status, dan flagging langsung di bawah.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-3 gap-1.5 lg:min-w-[280px]'>
                  {[
                    ['Total', pagination?.total ?? 0],
                    ['Open', summary?.open ?? 0],
                    ['Close', closePageData.pagination.total],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-2xl border border-(--border) bg-(--surface-2) px-2.5 py-2.5 text-center shadow-sm'
                    >
                      <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                        {label}
                      </p>
                      <p className='mt-0.5 text-[1rem] font-black text-(--text-primary) md:text-[1.1rem]'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
            <FilterBarB2B
              ticketType={ticketTypeFilter}
              ticketTypeOptions={ticketTypeOptions}
              statusUpdate={statusUpdateFilter}
              ticketStatus={ticketStatusFilter}
              flagging={flaggingFilter}
              onTypeChange={(types) => {
              setTicketTypeFilter(types);
              setPage(1);
              setClosePage(1);
            }}
            onStatusChange={(statuses) => {
              setStatusUpdateFilter(statuses);
              setPage(1);
              setClosePage(1);
            }}
            onTicketStatusChange={(statuses) => {
              setTicketStatusFilter(statuses);
              setPage(1);
              setClosePage(1);
            }}
            onFlaggingChange={(flags) => {
              setFlaggingFilter(flags);
              setPage(1);
              setClosePage(1);
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
                highlightQuery={searchQuery}
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
            closeCount={closePageData.pagination.total}
            validasiPagination={{
              currentPage: validasiPagination.currentPage,
              totalPages: validasiPagination.totalPages,
              total: validasiPagination.total,
              limit: validasiPagination.limit,
              onPageChange: setValidasiPage,
            }}
            closeTable={
              <TicketTable
                tickets={closePageData.tickets}
                loading={closePageData.loading}
                isRefreshing={closePageData.isRefreshing}
                onAssign={onAssign}
                highlightQuery={searchQuery}
                pagination={{
                  currentPage: closePageData.pagination.currentPage,
                  totalPages: closePageData.pagination.totalPages,
                  total: closePageData.pagination.total,
                  limit: closePageData.pagination.limit,
                  onPageChange: setClosePage,
                }}
                tableLabel='Non Technical Close Tickets'
                tableSummary={closePageData.summary}
                downloadFilters={{
                  dept: 'all',
                  operationalBucket: ['non_technical'],
                  ticketType: ticketTypeFilter,
                  statusUpdate: statusUpdateFilter,
                  ticketStatus: CLOSE_STATUS_VALUES,
                  flagging: flaggingFilter,
                }}
              />
            }
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
