'use client';

import { useState, useMemo, useCallback } from 'react';
import Pagination from '../tables/Pagination';
import TicketRow from './TicketRow';
import TicketCardMobile from './TicketCardMobile';
import TableEmptyState from '@/app/components/tables/TableEmptyState';
import TicketDetailDrawer from '../../admin/components/dashboard/TicketDetailDrawer';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  computeTicketRanks,
  TicketWithRank,
  calculateAgeInHours,
  sortByPriority,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';

export type SortField =
  | 'ticket'
  | 'serviceNo'
  | 'contactName'
  | 'customerType'
  | 'alamat'
  | 'bookingDate'
  | 'age'
  | 'jenisTiket'
  | 'workzone'
  | 'technicianName'
  | 'reportedDate'
  | 'priority';
export type SortOrder = 'asc' | 'desc';

interface TicketTableProps {
  tickets?: Array<{
    idTicket?: number;
    ticket?: string;
    serviceNo?: string;
    contactName?: string | null;
    contactPhone?: string | null;
    alamat?: string | null;
    bookingDate?: string | null;
    ctype?: TicketCtype;
    customerType?: string;
    summary?: string;
    jenisTiket?: string;
    workzone?: string;
    technicianName?: string | null;
    teknisiUserId?: number | null;
    hasilVisit?: string | null;
    STATUS_UPDATE?: string | null;
    closedAt?: string | null;
    reportedDate?: string | null;
    status?: string;
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
  }>;
  loading?: boolean;
  onAssign?: (ticket: any) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit?: number;
    onPageChange: (page: number) => void;
  };
}

interface SortConfig {
  field: SortField;
  order: SortOrder;
}

const SortIcon = ({
  field,
  currentField,
  order,
}: {
  field: SortField;
  currentField: SortField;
  order: SortOrder;
}) => {
  if (field !== currentField) {
    return (
      <svg
        className='h-4 w-4 text-gray-300'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4'
        />
      </svg>
    );
  }
  return order === 'asc' ? (
    <ChevronUp className='h-4 w-4 text-blue-600' />
  ) : (
    <ChevronDown className='h-4 w-4 text-blue-600' />
  );
};

export default function TicketTable({
  tickets = [],
  loading = false,
  onAssign,
  pagination,
}: TicketTableProps) {
  console.log('[TicketTable] Rendering:', {
    ticketsCount: tickets.length,
    loading,
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'age',
    order: 'asc',
  });
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const toggleExpand = useCallback((ticketId: number) => {
    setExpandedTicketId((prev) => (prev === ticketId ? null : ticketId));
  }, []);

  const sortedTickets = useMemo(() => {
    if (!tickets.length) return tickets;

    if (sortConfig.field === 'priority') {
      return sortByPriority(tickets);
    }

    return [...tickets].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortConfig.field === 'age') {
        aVal = calculateAgeInHours(a.reportedDate, a.hasilVisit, a.closedAt);
        bVal = calculateAgeInHours(b.reportedDate, b.hasilVisit, b.closedAt);
      } else if (sortConfig.field !== 'priority') {
        aVal = a[sortConfig.field as keyof typeof a];
        bVal = b[sortConfig.field as keyof typeof b];
      }

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortConfig.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tickets, sortConfig]);

  const ticketRanks = useMemo(() => {
    return computeTicketRanks(tickets);
  }, [tickets]);

  const handleAssign = onAssign || (() => {});

  const renderSortableHeader = (label: string, field: SortField) => (
    <th
      className='cursor-pointer px-3 py-3 text-center transition-colors hover:bg-gray-100'
      onClick={() => handleSort(field)}
    >
      <div className='flex items-center justify-center gap-1'>
        {label}
        <SortIcon
          field={field}
          currentField={sortConfig.field}
          order={sortConfig.order}
        />
      </div>
    </th>
  );

  return (
    <div className='space-y-4'>
      {/* DEBUG
      <div className='bg-yellow-100 p-2 text-sm'>
        DEBUG: tickets={tickets.length}, loading={loading}, sortedTickets=
        {sortedTickets.length}
        {pagination &&
          `, total=${pagination.total}, totalPages=${pagination.totalPages}`}
      </div> */}

      {/* Mobile */}
      <div className='block space-y-3 lg:hidden'>
        {loading ? (
          <p className='py-8 text-center text-gray-500'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-gray-500'>No tickets found</p>
        ) : (
          sortedTickets.map((ticket) => (
            <TicketCardMobile
              key={ticket.idTicket ?? ticket.ticket}
              ticket={ticket}
              onAssign={handleAssign}
            />
          ))
        )}
      </div>

      {/* Desktop */}
      <div className='block'>
        <div className='overflow-hidden rounded-xl border bg-white shadow-sm'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase'>
                <tr>
                  <th className='w-16 px-3 py-3 text-center'>#</th>
                  {renderSortableHeader('Ticket', 'ticket')}
                  {renderSortableHeader('Service', 'serviceNo')}
                  {renderSortableHeader('Customer', 'contactName')}
                  {renderSortableHeader('Address', 'alamat')}
                  {renderSortableHeader('Booking_Date', 'bookingDate')}
                  {renderSortableHeader('Type', 'customerType')}
                  <th className='px-3 py-3 text-center'>Max TTR</th>
                  {renderSortableHeader('Age', 'age')}
                  {renderSortableHeader('Jenis_Tiket', 'jenisTiket')}
                  {renderSortableHeader('Workzone', 'workzone')}
                  {renderSortableHeader('Technician', 'technicianName')}
                  <th className='px-3 py-3 text-center'>Status</th>
                  <th className='w-16 px-3 py-3 text-center'>Detail</th>
                  <th className='px-3 py-3 text-center'>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableEmptyState colSpan={14} message='Loading' />
                ) : sortedTickets.length === 0 ? (
                  <TableEmptyState colSpan={14} message='No tickets found' />
                ) : (
                  sortedTickets.map((ticket) => {
                    const ticketId = ticket.idTicket ?? ticket.ticket;
                    const isExpanded = expandedTicketId === ticketId;
                    const ticketInfo = ticketRanks.get(ticket.idTicket ?? -1);
                    return (
                      <TicketRow
                        key={ticketId}
                        ticket={ticket}
                        onAssign={handleAssign}
                        isExpanded={isExpanded}
                        onToggleExpand={() => toggleExpand(ticketId as number)}
                        rank={ticketInfo?.rank}
                        ticketAge={ticketInfo?.ageFormatted}
                        severity={ticketInfo?.severity}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:justify-between'>
          <p className='text-xs text-gray-500 sm:text-sm'>
            Showing{' '}
            {(pagination.currentPage - 1) * (pagination.limit ?? 10) + 1} to{' '}
            {Math.min(
              pagination.currentPage * (pagination.limit ?? 10),
              pagination.total,
            )}{' '}
            of {pagination.total}
          </p>

          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.onPageChange}
          />
        </div>
      )}

      <TicketDetailDrawer
        open={expandedTicketId !== null}
        onClose={() => setExpandedTicketId(null)}
        ticket={
          (sortedTickets.find(
            (t) => (t.idTicket ?? t.ticket) === expandedTicketId,
          ) as any) || null
        }
      />
    </div>
  );
}
