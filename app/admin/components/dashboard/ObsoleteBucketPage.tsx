'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { queryKeys } from '@/app/libs/query-keys';
import TicketTable from './TicketTable';
import TicketTableTabs from './TicketTableTabs';

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

export default function ObsoleteBucketPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(null);
  const [validasiPage, setValidasiPage] = useState(1);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const {
    tickets: pageTickets,
    pagination: pagePagination,
    summary,
    loading,
    isRefreshing,
    validasiTickets,
    validasiCount,
    validasiPagination,
  } = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'all',
    operationalBucket: ['obsolete'],
    page,
    limit: 10,
    validasiPage,
    includeValidasi: true,
  });

  const tickets = pageTickets ?? [];

  const tableSummary = useMemo(() => ({
    total: pagePagination?.total ?? tickets.length,
    open: summary?.open ?? 0,
    assigned: summary?.assigned ?? 0,
    close: summary?.close ?? 0,
  }), [pagePagination?.total, summary?.open, summary?.assigned, summary?.close]);

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

  const pagination = pagePagination
    ? {
        currentPage: pagePagination.currentPage,
        totalPages: pagePagination.totalPages,
        total: pagePagination.total,
        limit: pagePagination.limit,
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
            <div className='bg-[linear-gradient(180deg,rgba(245,243,255,0.78),rgba(255,255,255,0.96))] p-3.5 md:p-4 dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(17,24,39,0.8))]'>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                <div className='flex items-start gap-2.5'>
                  <div className='grid h-10 w-10 place-items-center rounded-2xl border border-(--border) bg-(--bg) text-[0.95rem] font-black text-violet-600 shadow-sm'>
                    OB
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-[10px] font-bold tracking-[0.24em] text-(--text-secondary) uppercase'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-[1.35rem] leading-none font-black tracking-[-0.03em] text-(--text-primary) md:text-[1.6rem]'>
                      Obsolete
                    </h1>
                    <p className='mt-1.5 max-w-2xl text-[13px] leading-5 text-(--text-secondary)'>
                      Bucket final / archived untuk classification_path
                      Z_PERMINTAAN_044, tetap dipantau sebagai slice operasional.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-3 gap-1.5 lg:min-w-[280px]'>
                  {[
                    ['Total', pagePagination?.total ?? 0],
                    ['Open', summary?.open ?? 0],
                    ['Close', summary?.close ?? 0],
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

          <TicketTableTabs
            section='obsolete'
            accentColor='#8b5cf6'
            mainTable={
              <TicketTable
                tickets={tickets}
                loading={loading}
                isRefreshing={isRefreshing}
                onAssign={onAssign}
                highlightQuery={searchQuery}
                pagination={pagination}
                tableLabel='Obsolete Tickets'
                tableSummary={tableSummary}
              />
            }
            tickets={tickets}
            validasiTickets={validasiTickets}
            totalCount={pagePagination?.total}
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
          onAssign={async (assignment) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            setAssignModalTicket(null);
            invalidateQueries();
          }}
        />
      )}
    </>
  );
}
