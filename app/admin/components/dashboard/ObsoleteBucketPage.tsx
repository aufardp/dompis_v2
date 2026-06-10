'use client';

import { useCallback, useMemo, useState } from 'react';
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
  const [page, setPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(null);
  const [validasiPage, setValidasiPage] = useState(1);

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
    search: '',
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
          <div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'>
            <div className='bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.04),transparent_40%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_30%)] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.08),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_25%)]'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-xl text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'>
                    📦
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-xs font-bold tracking-[1.5px] text-slate-400 uppercase dark:text-slate-500'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-2xl font-black text-slate-900 dark:text-slate-100'>
                      Obsolete
                    </h1>
                    <p className='mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400'>
                      Ticket dengan classification_path Z_PERMINTAAN_044.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-4 gap-3 lg:min-w-[320px]'>
                  {[
                    ['Total', pagePagination?.total ?? 0],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='col-span-4 rounded-2xl border border-slate-200 bg-white/85 p-3 text-center dark:border-slate-800 dark:bg-slate-900/80'
                    >
                      <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                        {label}
                      </p>
                      <p className='mt-1 text-xl font-black text-slate-900 dark:text-slate-100'>
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
