'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { B2B_GROUPS } from '@/app/config/b2b-groups';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { queryKeys } from '@/app/libs/query-keys';
import TicketTableB2B from './TicketTableB2B';
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
}: {
  groupKey: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const groupMeta = useMemo(
    () => B2B_GROUPS.find((group) => group.key === groupKey) ?? null,
    [groupKey],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [page, setPage] = useState(1);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );

  const pageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketGroup: [groupKey],
    page,
    limit: 10,
  });

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setPage(1);
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
          <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950'>
            <div className='flex items-start gap-4'>
              <div className='grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xl dark:bg-blue-500/10'>
                {groupMeta.icon}
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-xs font-bold tracking-[1.5px] text-slate-400 uppercase dark:text-slate-500'>
                  Ticket Management / B2B Group
                </p>
                <h1 className='mt-1 text-2xl font-black text-slate-900 dark:text-slate-100'>
                  {groupMeta.label}
                </h1>
                <p className='mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400'>
                  Halaman khusus untuk tiket B2B dengan `jenis_tiket_1`{' '}
                  {groupMeta.label}. Tabel ini tetap mendukung assign, filter
                  status, flagging, dan export.
                </p>
              </div>
            </div>
          </div>

          <TicketTableB2B
            tickets={pageData.tickets}
            tableSummary={tableSummary}
            loading={pageData.loading}
            isRefreshing={pageData.isRefreshing}
            onAssign={handleAssignClick}
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
