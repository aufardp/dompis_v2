'use client';

import { useState, useMemo, useCallback } from 'react';
import Pagination from '../../../components/tables/Pagination';
import TicketRowSemesta from './TicketRowSemesta';
import TableEmptyState from '../../../components/tables/TableEmptyState';
import { ChevronDown, ChevronUp, Hash, MapPin, User, Clock3, Phone } from 'lucide-react';
import {
  calculateAgeInHours,
  sortByPriority,
  getTicketSeverity,
  formatAge,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import Badge from '../../../components/ui/badge/Badge';
import CustomerTypeBadge from '../../../components/tickets/CustomerTypeBadge';
import { getStatusColor, getMaxTtr, getTicketAge, getTicketAgeColorClass } from '../../../components/tickets/helpers';
import { formatDate } from '../../../components/tickets/helpers';
import { computeTtrCountdown } from '@/app/hooks/useTtrCountdown';
import TableLoadingSkeleton from './TableLoadingSkeleton';

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
  | 'reportedDate';

export type SortOrder = 'asc' | 'desc';

export interface AdminTicketTableSemestaProps {
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
    closedAt?: string | null;
    reportedDate?: string | null;
    status?: string;
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
    flaggingManja?: string | null;
    guaranteeStatus?: string | null;
  }>;
  loading?: boolean;
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
      <span className='text-xs text-(--text-secondary) opacity-40'>↕</span>
    );
  }
  return order === 'asc' ? (
    <ChevronUp className='h-3.5 w-3.5 text-blue-500' />
  ) : (
    <ChevronDown className='h-3.5 w-3.5 text-blue-500' />
  );
};

const COL_LABELS: Record<string, string> = {
  service: 'Service',
  customer: 'Customer',
  address: 'Address',
  bookingDate: 'Booking Date',
  type: 'Type',
  maxTtr: 'Max TTR',
  age: 'Age / SLA',
  jenis: 'Jenis Tiket',
  workzone: 'Workzone',
  technician: 'Technician',
  status: 'Status',
};

type ColKey = keyof typeof COL_LABELS;

const DEFAULT_COLS: Record<ColKey, boolean> = {
  service: true,
  customer: true,
  address: true,
  bookingDate: true,
  type: true,
  maxTtr: true,
  age: true,
  jenis: true,
  workzone: true,
  technician: true,
  status: true,
};

export default function TicketTableSemesta({
  tickets = [],
  loading = false,
  pagination,
}: AdminTicketTableSemestaProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'reportedDate',
    order: 'desc',
  });
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [visibleCols, setVisibleCols] =
    useState<Record<ColKey, boolean>>(DEFAULT_COLS);

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
    return [...tickets].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      if (sortConfig.field === 'age') {
        aVal = calculateAgeInHours(a.reportedDate, a.hasilVisit, a.closedAt);
        bVal = calculateAgeInHours(b.reportedDate, b.hasilVisit, b.closedAt);
      } else {
        aVal = a[sortConfig.field as keyof typeof a];
        bVal = b[sortConfig.field as keyof typeof b];
      }
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (aVal < bVal) return sortConfig.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tickets, sortConfig]);

  const currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.limit ?? 50;
  const pageOffset = (currentPage - 1) * pageSize;
  const pageTickets = pagination
    ? sortedTickets.slice(pageOffset, pageOffset + pageSize)
    : sortedTickets;

  // Calculate global row number offset for pagination
  const rowOffset = pageOffset;

  const renderSortableHeader = (label: string, field: SortField) => (
    <th
      className='hover:bg-surface-2 cursor-pointer px-3 py-3 text-center transition-colors'
      onClick={() => handleSort(field)}
    >
      <div className='flex items-center justify-center gap-1'>
        <span>{label}</span>
        <SortIcon
          field={field}
          currentField={sortConfig.field}
          order={sortConfig.order}
        />
      </div>
    </th>
  );

  return (
    <div className='space-y-3'>
      {/* Mobile */}
      <div className='block space-y-3 lg:hidden'>
        {loading ? (
          <p className='py-8 text-center text-(--text-secondary)'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-(--text-secondary)'>
            No tickets found
          </p>
        ) : (
          pageTickets.map((ticket) => {
            const maxTtr = getMaxTtr(ticket) || '-';
            return (
            <div
              key={ticket.idTicket ?? ticket.ticket}
              className='group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4'
            >
              <div className='flex items-start justify-between gap-2 sm:gap-3'>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
                    <p className='truncate text-sm font-semibold text-slate-900'>
                      {ticket.ticket || '-'}
                    </p>
                    <span className='text-xs text-slate-500'>
                      {ticket.reportedDate ? formatDate(ticket.reportedDate) : '-'}
                    </span>
                  </div>
                  <p className='mt-1 truncate text-sm text-slate-700'>
                    {ticket.summary || '-'}
                  </p>
                </div>

                <div className='flex shrink-0 flex-col items-end gap-1'>
                  <Badge size='sm' color={getStatusColor(ticket.hasilVisit || '')}>
                    {ticket.hasilVisit || '-'}
                  </Badge>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTicketAgeColorClass(ticket)}`}
                  >
                    {getTicketAge(ticket)}
                  </span>
                </div>
              </div>

              <div className='mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2'>
                <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
                  <Hash className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
                  <div className='min-w-0'>
                    <p className='text-[11px] text-slate-500'>Service</p>
                    <p className='truncate font-semibold'>
                      {ticket.serviceNo || '-'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
                  <MapPin className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
                  <div className='min-w-0'>
                    <p className='text-[11px] text-slate-500'>Workzone</p>
                    <p className='truncate font-semibold'>
                      {ticket.workzone || '-'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
                  <User className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
                  <div className='min-w-0'>
                    <p className='text-[11px] text-slate-500'>Type</p>
                    <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
                  </div>
                </div>
                <div className='flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2'>
                  <Clock3 className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
                  <div className='min-w-0'>
                    <p className='text-[11px] text-slate-500'>Max TTR</p>
                    <p className='truncate font-semibold'>{maxTtr}</p>
                  </div>
                </div>
              </div>

              <div className='mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3 sm:py-2'>
                <div className='min-w-0'>
                  <p className='text-[11px] text-slate-500'>Customer</p>
                  <p className='truncate text-sm font-semibold text-slate-900'>
                    {ticket.contactName || '-'}
                  </p>
                </div>
                <div className='min-w-0 text-right sm:shrink-0'>
                  <p className='text-[11px] text-slate-500'>Phone</p>
                  <p className='inline-flex items-center gap-1 text-sm font-medium text-slate-700'>
                    <Phone className='h-3.5 w-3.5 text-slate-500 sm:h-4 sm:w-4' />
                    <span className='tabular-nums'>
                      {ticket.contactPhone || '-'}
                    </span>
                  </p>
                </div>
              </div>

              <div className='mt-3 flex items-center justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                  <p className='text-[11px] text-slate-500'>Technician</p>
                  <p className='truncate text-sm font-medium text-slate-800'>
                    {ticket.technicianName || (
                      <span className='text-slate-400 italic'>Unassigned</span>
                    )}
                  </p>
                  <p className='mt-0.5 text-xs text-slate-500'>
                    Jenis tiket: {ticket.jenisTiket || '-'}
                  </p>
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>

      {/* Desktop */}
      <div className='hidden lg:block'>
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border) shadow-sm'>
          {/* Table toolbar */}
          <div className='bg-surface-2 flex items-center justify-between border-b border-(--border) px-4 py-2'>
            <p className='text-xs text-(--text-secondary)'>
              {pagination?.total ?? sortedTickets.length} tiket (Database Bank)
            </p>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
                <tr>
                  <th className='w-10 px-3 py-3 text-center'>#</th>
                  <th className='w-16 px-3 py-3 text-center'>No</th>
                  {renderSortableHeader('Ticket', 'ticket')}
                  {visibleCols.service &&
                    renderSortableHeader('Service', 'serviceNo')}
                  {visibleCols.customer &&
                    renderSortableHeader('Customer', 'contactName')}
                  {visibleCols.address && (
                    <th className='px-3 py-3 text-center'>Address</th>
                  )}
                  {visibleCols.bookingDate &&
                    renderSortableHeader('Booking Date', 'bookingDate')}
                  {visibleCols.type &&
                    renderSortableHeader('Type', 'customerType')}
                  {visibleCols.maxTtr && (
                    <th className='px-3 py-3 text-center'>Max TTR</th>
                  )}
                  {visibleCols.age && renderSortableHeader('Age / SLA', 'age')}
                  {visibleCols.jenis &&
                    renderSortableHeader('Jenis Tiket', 'jenisTiket')}
                  {visibleCols.workzone &&
                    renderSortableHeader('Workzone', 'workzone')}
                  {visibleCols.technician &&
                    renderSortableHeader('Teknisi', 'technicianName')}
                  {visibleCols.status && (
                    <th className='px-3 py-3 text-center'>Status</th>
                  )}
                  {/* Detail column */}
                  <th className='px-3 py-3 text-center'>Aksi</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {loading ? (
                  <tr><td colSpan={15}><TableLoadingSkeleton rows={6} cols={15} /></td></tr>
                ) : sortedTickets.length === 0 ? (
                  <TableEmptyState
                    colSpan={15}
                    message='Tidak ada tiket ditemukan'
                  />
                ) : (
                  pageTickets.map((ticket, idx) => {
                    const ticketId = ticket.idTicket ?? ticket.ticket;
                    const isExpanded = expandedTicketId === ticketId;
                    const ttrCountdown = computeTtrCountdown(ticket);
                    const slaLabel: 'On Track' | 'At Risk' | 'Overdue' =
                      !ttrCountdown
                        ? 'On Track'
                        : ttrCountdown.status === 'overdue'
                          ? 'Overdue'
                          : ttrCountdown.status === 'critical'
                            ? 'Overdue'
                            : ttrCountdown.status === 'warning'
                              ? 'At Risk'
                              : 'On Track';
                    const severity = getTicketSeverity(
                      ticket.reportedDate,
                      ticket.hasilVisit,
                      ticket.closedAt,
                    );
                    const ageFormatted = formatAge(
                      ticket.reportedDate,
                      ticket.hasilVisit,
                      ticket.closedAt,
                    );
                    const globalIndex = rowOffset + idx + 1;

                    return (
                      <TicketRowSemesta
                        key={ticketId}
                        ticket={ticket}
                        isExpanded={isExpanded}
                        onToggleExpand={() => toggleExpand(ticketId as number)}
                        rowNumber={globalIndex}
                        ticketAge={ageFormatted}
                        severity={severity}
                        slaLabel={slaLabel}
                        ttrCountdown={ttrCountdown}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className='bg-surface flex flex-col items-center gap-3 border-t border-(--border) px-5 py-3 sm:flex-row sm:justify-between'>
              <p className='text-xs text-(--text-secondary)'>
                Showing{' '}
                <span className='font-semibold text-(--text-primary)'>
                  {(pagination.currentPage - 1) * (pagination.limit ?? 10) + 1}–
                  {Math.min(
                    pagination.currentPage * (pagination.limit ?? 10),
                    pagination.total,
                  )}
                </span>{' '}
                of{' '}
                <span className='font-semibold text-(--text-primary)'>
                  {pagination.total}
                </span>{' '}
                tiket
              </p>
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.onPageChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* SLA Legend */}
      <div className='flex flex-wrap items-center gap-4 px-1 pt-1'>
        <span className='text-[10px] font-bold tracking-wider text-(--text-secondary) uppercase'>
          SLA:
        </span>
        {[
          { label: 'On Track', color: 'bg-emerald-500' },
          { label: 'At Risk', color: 'bg-amber-500' },
          { label: 'Overdue', color: 'bg-red-500' },
        ].map((s) => (
          <span
            key={s.label}
            className='flex items-center gap-1.5 text-[10px] text-(--text-secondary)'
          >
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
