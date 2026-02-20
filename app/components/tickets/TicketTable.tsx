'use client';

import { useState, useMemo, useCallback } from 'react';
import Pagination from '../tables/Pagination';
import TicketRow from './TicketRow';
import TicketCardMobile from './TicketCardMobile';
import TableEmptyState from '@/app/components/tables/TableEmptyState';

export type SortField =
  | 'ticket'
  | 'serviceNo'
  | 'contactName'
  | 'customerType'
  | 'maxTtr'
  | 'jenisTiket'
  | 'age'
  | 'summary'
  | 'workzone'
  | 'technicianName'
  | 'status'
  | 'reportedDate';
export type SortOrder = 'asc' | 'desc';

interface TicketTableProps {
  tickets?: Array<any>;
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
    <svg
      className='h-4 w-4 text-blue-600'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M5 15l7-7 7 7'
      />
    </svg>
  ) : (
    <svg
      className='h-4 w-4 text-blue-600'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M19 9l-7 7-7-7'
      />
    </svg>
  );
};

export default function TicketTable({
  tickets = [],
  loading = false,
  onAssign,
  pagination,
}: TicketTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'reportedDate',
    order: 'desc',
  });

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const sortedTickets = useMemo(() => {
    if (!tickets.length) return tickets;

    return [...tickets].sort((a, b) => {
      let aVal: any = a[sortConfig.field];
      let bVal: any = b[sortConfig.field];

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

  const handleAssign = onAssign || (() => {});

  const renderSortableHeader = (label: string, field: SortField) => (
    <th
      className='cursor-pointer px-5 py-3 text-center transition-colors hover:bg-gray-100'
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
      {/* Mobile */}
      <div className='space-y-3 lg:hidden'>
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
      <div className='hidden lg:block'>
        <div className='overflow-hidden rounded-xl border bg-white shadow-sm'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase'>
                <tr>
                  {renderSortableHeader('Ticket', 'ticket')}
                  {renderSortableHeader('Service', 'serviceNo')}
                  {renderSortableHeader('Customer', 'contactName')}
                  {renderSortableHeader('Type', 'customerType')}
                  {renderSortableHeader('Max_TTR', 'maxTtr')}
                  {renderSortableHeader('Jenis_Tiket', 'jenisTiket')}
                  {renderSortableHeader('Age', 'age')}
                  {renderSortableHeader('Summary', 'summary')}
                  {renderSortableHeader('Workzone', 'workzone')}
                  {renderSortableHeader('Technician', 'technicianName')}
                  {renderSortableHeader('Status', 'status')}
                  <th className='px-5 py-3 text-center'>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableEmptyState colSpan={12} message='Loading' />
                ) : sortedTickets.length === 0 ? (
                  <TableEmptyState colSpan={12} message='No tickets found' />
                ) : (
                  sortedTickets.map((ticket) => (
                    <TicketRow
                      key={ticket.idTicket ?? ticket.ticket}
                      ticket={ticket}
                      onAssign={handleAssign}
                    />
                  ))
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
    </div>
  );
}
