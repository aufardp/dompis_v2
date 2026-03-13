'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Pagination from '../../../components/tables/Pagination';
import TicketRow from './TicketRow';
import TicketCardMobile from '../../../components/tickets/TicketCardMobile';
import TableEmptyState from '../../../components/tables/TableEmptyState';
import TicketDetailDrawer from './TicketDetailDrawer';
import { ChevronDown, ChevronUp, Columns3, X } from 'lucide-react';
import {
  computeTicketRanks,
  calculateAgeInHours,
  sortByPriority,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import TicketTableSummaryBar from './TicketTableSummaryBar'; // ← ADDED
import { fetchWithAuth } from '@/app/libs/fetcher';
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
  | 'reportedDate'
  | 'priority';
export type SortOrder = 'asc' | 'desc';

export interface AdminTicketTableProps {
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
  onAssign?: (ticketId: string | number) => void;
  onDetail?: (ticketId: string | number) => void;
  onBulkAssign?: (ticketIds: (string | number)[]) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit?: number;
    onPageChange: (page: number) => void;
  };
  tableSummary?: {
    // ← ADDED
    total: number;
    open: number;
    assigned: number;
    close: number;
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

export default function TicketTable({
  tickets = [],
  loading = false,
  onAssign,
  onDetail,
  onBulkAssign,
  pagination,
  tableSummary, // ← ADDED
}: AdminTicketTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'priority',
    order: 'asc',
  });
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(
    new Set(),
  );
  const [visibleCols, setVisibleCols] =
    useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showColMenu, setShowColMenu] = useState(false);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const toggleExpand = useCallback((ticketId: number) => {
    setExpandedTicketId((prev) => (prev === ticketId ? null : ticketId));
  }, []);

  // Fetch ticket detail when drawer opens
  useEffect(() => {
    if (!expandedTicketId) {
      setDrawerDetail(null);
      setDrawerError(null);
      return;
    }

    setDrawerLoading(true);
    setDrawerError(null);

    fetchWithAuth(`/api/tickets/${expandedTicketId}/detail`)
      .then((res) => (res ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.success) {
          setDrawerDetail(data.data);
        } else {
          setDrawerError(data.message || 'Gagal memuat detail tiket');
        }
      })
      .catch(() => setDrawerError('Terjadi kesalahan jaringan'))
      .finally(() => setDrawerLoading(false));
  }, [expandedTicketId]);

  const sortedTickets = useMemo(() => {
    if (!tickets.length) return tickets;
    if (sortConfig.field === 'priority') return sortByPriority(tickets);
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
  const pageSize = pagination?.limit ?? 10;
  const pageOffset = (currentPage - 1) * pageSize;
  const pageTickets = pagination
    ? sortedTickets.slice(pageOffset, pageOffset + pageSize)
    : sortedTickets;

  const ticketRanks = useMemo(() => computeTicketRanks(tickets), [tickets]);
  const handleAssign = onAssign ?? (() => {});

  // Selection helpers
  const allIds = pageTickets.map((t) => t.idTicket ?? t.ticket ?? '');
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  function toggleSelect(id: string | number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

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
      {/* ── Bulk action bar (appears when rows are selected) ── */}
      {someSelected && (
        <div className='flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5'>
          <span className='text-sm font-semibold text-blue-700'>
            {selectedIds.size} tiket dipilih
          </span>
          <div className='flex gap-2'>
            {onBulkAssign && (
              <button
                onClick={() => {
                  onBulkAssign([...selectedIds]);
                  clearSelection();
                }}
                className='rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700'
              >
                Assign Semua
              </button>
            )}
            <button
              onClick={clearSelection}
              className='flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50'
            >
              <X size={12} /> Batal
            </button>
          </div>
        </div>
      )}

      {/* Mobile */}
      <div className='block space-y-3 lg:hidden'>
        {loading ? (
          <p className='py-8 text-center text-(--text-secondary)'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-(--text-secondary)'>
            No tickets found
          </p>
        ) : (
          pageTickets.map((ticket) => (
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
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border) shadow-sm'>
          {/* Table toolbar */}
          <div className='bg-surface-2 flex items-center justify-between border-b border-(--border) px-4 py-2'>
            <p className='text-xs text-(--text-secondary)'>
              {pagination?.total ?? sortedTickets.length} tiket
            </p>
            {/* Column customizer */}
            <div className='relative'>
              <button
                onClick={() => setShowColMenu((v) => !v)}
                className='bg-surface flex items-center gap-1.5 rounded-lg border border-(--border) px-2.5 py-1.5 text-xs font-semibold text-(--text-secondary) transition-colors hover:border-blue-300 hover:text-blue-600'
              >
                <Columns3 size={13} />
                Kolom
              </button>
              {showColMenu && (
                <div className='bg-surface absolute top-9 right-0 z-50 w-44 rounded-2xl border border-(--border) shadow-xl'>
                  <div className='border-b border-(--border) px-3 py-2 text-[10px] font-bold tracking-wider text-(--text-secondary) uppercase'>
                    Tampilkan Kolom
                  </div>
                  <div className='space-y-0.5 p-2'>
                    {(Object.entries(COL_LABELS) as [ColKey, string][]).map(
                      ([key, label]) => (
                        <label
                          key={key}
                          className='hover:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5'
                        >
                          <input
                            type='checkbox'
                            checked={visibleCols[key]}
                            onChange={() =>
                              setVisibleCols((v) => ({ ...v, [key]: !v[key] }))
                            }
                            className='rounded border-slate-300 accent-blue-600'
                          />
                          <span className='text-xs text-(--text-primary)'>
                            {label}
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ← ADDED: Summary bar */}
          {tableSummary && (
            <TicketTableSummaryBar label='B2C Tickets' {...tableSummary} />
          )}

          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
                <tr>
                  {/* Checkbox all */}
                  <th className='w-10 px-3 py-3 text-center'>
                    <input
                      type='checkbox'
                      checked={allSelected}
                      onChange={toggleAll}
                      className='rounded border-slate-300 accent-blue-600'
                    />
                  </th>
                  <th className='w-16 px-3 py-3 text-center'>#</th>
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
                  {/* Merged action column */}
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
                  pageTickets.map((ticket) => {
                    const ticketId = ticket.idTicket ?? ticket.ticket;
                    const isExpanded = expandedTicketId === ticketId;
                    const ticketInfo = ticketRanks.get(ticket.idTicket ?? -1);
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
                    const isSelected = selectedIds.has(ticketId ?? '');

                    return (
                      <TicketRow
                        key={ticketId}
                        ticket={ticket}
                        onAssign={handleAssign}
                        onDetail={onDetail}
                        isExpanded={isExpanded}
                        onToggleExpand={() => toggleExpand(ticketId as number)}
                        rank={ticketInfo?.rank}
                        ticketAge={ticketInfo?.ageFormatted}
                        severity={ticketInfo?.severity}
                        slaLabel={slaLabel}
                        ttrCountdown={ttrCountdown}
                        selected={isSelected}
                        onSelect={() => toggleSelect(ticketId ?? '')}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination inside card */}
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

      {/* Detail Drawer */}
      <TicketDetailDrawer
        open={expandedTicketId !== null}
        onClose={() => {
          setExpandedTicketId(null);
          setDrawerDetail(null);
        }}
        ticket={drawerDetail}
        loading={drawerLoading}
        error={drawerError}
        onRetry={() => {
          if (expandedTicketId) {
            setDrawerDetail(null);
            setDrawerError(null);
            setDrawerLoading(true);
            fetchWithAuth(`/api/tickets/${expandedTicketId}/detail`)
              .then((r) => (r ? r.json().catch(() => null) : null))
              .then((d) => {
                if (d?.success) setDrawerDetail(d.data);
              })
              .catch(() => setDrawerError('Gagal retry'))
              .finally(() => setDrawerLoading(false));
          }
        }}
      />

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
