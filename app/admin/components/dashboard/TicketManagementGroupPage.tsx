'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { B2B_GROUPS } from '@/app/config/b2b-groups';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';
import { queryKeys } from '@/app/libs/query-keys';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import TicketTableB2B from './TicketTableB2B';
import TicketTableTabs from './TicketTableTabs';
import type { Ticket } from '@/app/types/ticket';

const AssignTechnicianModal = dynamic(
  () => import('@/app/admin/components/dashboard/assign/AssignTechnicianModal'),
  { ssr: false, loading: () => null },
);

type AssignResult = {
  technicianId: number | null;
  technicianName: string | null;
};

type TicketData = {
  idTicket: number;
  ticketCode?: string;
  workzone?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number;
};

function patchTicketAssignmentInCache(
  previous: any,
  ticketId: number,
  assignment: AssignResult,
) {
  const matchesTicket = (value: unknown) =>
    String(value ?? '') === String(ticketId);
  const patchTicket = (ticket: any) =>
    matchesTicket(ticket?.idTicket) || matchesTicket(ticket?.id_ticket)
      ? {
          ...ticket,
          teknisiUserId: assignment.technicianId,
          teknisi_user_id: assignment.technicianId,
          technicianName: assignment.technicianName,
          technician_name: assignment.technicianName,
          users: ticket?.users
            ? { ...ticket.users, nama: assignment.technicianName }
            : ticket?.users,
        }
      : ticket;

  if (Array.isArray(previous)) return previous.map(patchTicket);
  if (!previous || typeof previous !== 'object') return previous;

  const next = { ...previous };
  if (matchesTicket(next.idTicket) || matchesTicket(next.id_ticket)) {
    next.teknisiUserId = assignment.technicianId;
    next.teknisi_user_id = assignment.technicianId;
    next.technicianName = assignment.technicianName;
    next.technician_name = assignment.technicianName;
    if (next.users)
      next.users = { ...next.users, nama: assignment.technicianName };
  }
  if (Array.isArray(next.data)) next.data = next.data.map(patchTicket);
  if (Array.isArray(next.tickets)) next.tickets = next.tickets.map(patchTicket);
  if (Array.isArray(next.validasiTickets))
    next.validasiTickets = next.validasiTickets.map(patchTicket);
  return next;
}

export default function TicketManagementGroupPage({
  groupKey,
  initialWorkzone = '',
}: {
  groupKey: string;
  initialWorkzone?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const groupMeta = useMemo(
    () => B2B_GROUPS.find((group) => group.key === groupKey) ?? null,
    [groupKey],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const { workzone: workzoneFilter, setWorkzone: setWorkzoneFilter } =
    usePersistentWorkzoneScope(initialWorkzone);
  const [page, setPage] = useState(1);
  const [validasiPage, setValidasiPage] = useState(1);
  const [closePage, setClosePage] = useState(1);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const pageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketGroup: [groupKey],
    page,
    limit: 10,
    validasiPage,
    includeOptions: false,
  });

  const closePageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketGroup: [groupKey],
    ticketStatus: CLOSE_STATUS_VALUES,
    page: closePage,
    limit: 10,
    validasiPage: 1,
    includeValidasi: false,
    includeOptions: false,
  });

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
    setClosePage(1);

    const nextParams = new URLSearchParams(searchParams.toString());
    const trimmedQuery = query.trim();
    if (trimmedQuery) nextParams.set('search', trimmedQuery);
    else nextParams.delete('search');
    const nextUrl = nextParams.toString()
      ? `${pathname}?${nextParams.toString()}`
      : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setPage(1);
    setClosePage(1);
  }, []);

  const handleAssignClick = useCallback(
    (ticketId: number | string) => {
      const ticket = pageData.tickets.find(
        (t) => String(t.idTicket) === String(ticketId),
      );
      setAssignModalTicket({
        idTicket: Number(ticketId),
        ticketCode: ticket?.ticket,
        workzone: ticket?.workzone ?? null,
        technicianName: ticket?.technicianName ?? null,
        teknisiUserId: ticket?.teknisiUserId ?? undefined,
      });
    },
    [pageData.tickets],
  );

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (query.queryKey[0] === queryKeys.tickets.all[0] ||
          query.queryKey[0] === queryKeys.dashboard.all[0]),
      refetchType: 'active',
    });
  }, [queryClient]);

  const tableSummary = useMemo(() => {
    const summary = pageData.summary;
    return {
      total: summary.total,
      open: summary.open,
      assigned: summary.assigned,
      close: summary.close,
    };
  }, [pageData.summary]);

  if (!groupMeta) {
    router.replace('/admin');
    return null;
  }

  return (
    <>
      <AdminLayout
        onSearch={handleSearch}
        onWorkzoneChange={handleWorkzoneChange}
        selectedWorkzone={workzoneFilter}
      >
        <div className='space-y-5'>
          <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
            <div className='bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.04),transparent_30%)] p-5'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='grid h-14 w-14 place-items-center rounded-3xl border border-(--border) bg-(--bg) text-[1.15rem] font-semibold text-blue-600 shadow-sm'>
                    <groupMeta.icon size={22} />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-[10px] font-bold tracking-[0.24em] text-(--text-secondary) uppercase'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-2xl font-semibold text-(--text-primary)'>
                      {groupMeta.label}
                    </h1>
                    <p className='mt-2 max-w-3xl text-sm leading-6 text-(--text-secondary)'>
                      Halaman khusus tiket B2B group {groupMeta.label}. Tabel
                      ini tetap mendukung assign, filter status, flagging, dan
                      export.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-4 gap-3 lg:min-w-[320px]'>
                  {[
                    ['Total', pageData.pagination.total],
                    ['Open', pageData.summary.open],
                    ['Assigned', pageData.summary.assigned],
                    ['Close', closePageData.pagination.total],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-2xl border border-(--border) bg-(--surface-2) p-3 text-center shadow-sm'
                    >
                      <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                        {label}
                      </p>
                      <p className='mt-1 text-xl font-semibold text-(--text-primary)'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className='mt-4 flex flex-wrap gap-2'>
                <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  B2B Group
                </span>
                <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  Search
                </span>
                <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  Assign
                </span>
              </div>
            </div>
          </div>

          <TicketTableTabs
            section={groupKey}
            accentColor='#3b82f6'
            mainTable={
              <TicketTableB2B
                tickets={pageData.tickets}
                tableSummary={tableSummary}
                loading={pageData.loading}
                isRefreshing={pageData.isRefreshing}
                onAssign={handleAssignClick}
                highlightQuery={searchQuery}
                downloadFilters={{
                  dept: 'b2b',
                  ticketGroup: [groupKey],
                }}
                pagination={{
                  currentPage: pageData.pagination.currentPage,
                  totalPages: pageData.pagination.totalPages,
                  total: pageData.pagination.total,
                  limit: pageData.pagination.limit,
                  onPageChange: setPage,
                }}
              />
            }
            tickets={pageData.tickets}
            validasiTickets={pageData.validasiTickets}
            totalCount={pageData.pagination.total}
            validasiTotalCount={pageData.validasiCount}
            closeCount={closePageData.pagination.total}
            validasiPagination={{
              currentPage: pageData.validasiPagination.currentPage,
              totalPages: pageData.validasiPagination.totalPages,
              total: pageData.validasiPagination.total,
              limit: pageData.validasiPagination.limit,
              onPageChange: setValidasiPage,
            }}
            closeTable={
              <TicketTableB2B
                tickets={closePageData.tickets}
                tableSummary={closePageData.summary}
                loading={closePageData.loading}
                isRefreshing={closePageData.isRefreshing}
                onAssign={handleAssignClick}
                highlightQuery={searchQuery}
                pagination={{
                  currentPage: closePageData.pagination.currentPage,
                  totalPages: closePageData.pagination.totalPages,
                  total: closePageData.pagination.total,
                  limit: closePageData.pagination.limit,
                  onPageChange: setClosePage,
                }}
                downloadFilters={{
                  dept: 'b2b',
                  ticketGroup: [groupKey],
                  ticketStatus: CLOSE_STATUS_VALUES,
                }}
              />
            }
            loading={pageData.loading}
            isRefreshing={pageData.isRefreshing}
            onAssign={handleAssignClick}
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
            if (assignment) {
              queryClient.setQueriesData(
                {
                  predicate: (query) =>
                    Array.isArray(query.queryKey) &&
                    query.queryKey[0] === queryKeys.tickets.all[0],
                },
                (previous) =>
                  patchTicketAssignmentInCache(
                    previous,
                    assignModalTicket.idTicket,
                    assignment,
                  ),
              );
            }
            setAssignModalTicket(null);
            invalidateQueries();
          }}
        />
      )}
    </>
  );
}
