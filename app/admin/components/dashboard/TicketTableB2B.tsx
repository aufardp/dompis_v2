'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Pagination from '../../../components/tables/Pagination';
import MobilePagination from '../../../components/tables/MobilePagination';
import TicketRowB2B from './TicketRowB2B';
import TicketCardMobile from '../../../components/tickets/TicketCardMobile';
import TableEmptyState from '../../../components/tables/TableEmptyState';
import TicketDetailDrawer from './TicketDetailDrawer';
import { ChevronDown, ChevronUp, Columns3, X, Download, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  computeTicketRanks,
  calculateAgeInHours,
  sortByPriority,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import TicketTableSummaryBar from './TicketTableSummaryBar'; // ← ADDED
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

export interface AdminTicketTableB2BProps {
  tickets?: Array<{
    idTicket?: number;
    ticket?: string;
    serviceNo?: string;
    ticketIdGamas?: string | null;
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
    statusUpdate?: string | null;
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
  flaggingFilter?: string[];
  downloadFilters?: {
    dept: 'b2b' | 'b2c';
    ticketType?: string[];
    statusUpdate?: string[];
    flagging?: string[];
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

export default function TicketTableB2B({
  tickets = [],
  loading = false,
  onAssign,
  onDetail,
  onBulkAssign,
  pagination,
  tableSummary,
  downloadFilters,
}: AdminTicketTableB2BProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'priority',
    order: 'asc',
  });
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [mobilePage, setMobilePage] = useState(1);
  const [drawerDetail, setDrawerDetail] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!downloadFilters) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('format', downloadFormat);
      params.set('dept', downloadFilters.dept);

      for (const t of downloadFilters.ticketType ?? []) {
        params.append('ticketType', t);
      }
      for (const s of downloadFilters.statusUpdate ?? []) {
        params.append('statusUpdate', s);
      }
      for (const f of downloadFilters.flagging ?? []) {
        params.append('flagging', f);
      }

      const res = await fetchWithAuth(
        `/api/tickets/daily/export?${params.toString()}`,
      );
      if (!res) {
        alert('Export gagal: session expired');
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? 'Export gagal');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tiket_${downloadFilters.dept.toUpperCase()}_${downloadFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message ?? 'Export gagal');
    } finally {
      setDownloading(false);
    }
  }, [downloadFilters, downloadFormat]);

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

    fetch(`/api/tickets/${expandedTicketId}/detail`)
      .then((res) => {
        if (res.status === 401) {
          window.location.assign('/login');
          return null;
        }
        return res.json();
      })
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
        aVal = calculateAgeInHours(a.reportedDate, a.statusUpdate, a.closedAt);
        bVal = calculateAgeInHours(b.reportedDate, b.statusUpdate, b.closedAt);
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

  const MOBILE_PAGE_SIZE = 5;
  const mobileTotalPages = Math.max(1, Math.ceil(sortedTickets.length / MOBILE_PAGE_SIZE));
  const mobilePageTickets = sortedTickets.slice(
    (mobilePage - 1) * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE,
  );

  const ticketRanks = useMemo(() => computeTicketRanks(tickets), [tickets]);
  const handleAssign = onAssign ?? (() => {});

  // Selection helpers
  // Removed selection helpers: allIds, allSelected, someSelected, toggleAll, toggleSelect, clearSelection

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

      {/* Mobile */}
      <div className='block lg:hidden'>
        {loading ? (
          <p className='py-8 text-center text-(--text-secondary)'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-(--text-secondary)'>
            No tickets found
          </p>
        ) : (
          <>
            <div className='mb-2 flex items-center justify-between px-1'>
              <p className='text-xs text-(--text-secondary)'>
                {(mobilePage - 1) * MOBILE_PAGE_SIZE + 1}–
                {Math.min(mobilePage * MOBILE_PAGE_SIZE, sortedTickets.length)} dari{' '}
                {sortedTickets.length} tiket
              </p>
              {mobileTotalPages > 1 && (
                <span className='text-xs font-semibold text-(--text-primary)'>
                  Halaman {mobilePage}/{mobileTotalPages}
                </span>
              )}
            </div>
            <div className='space-y-3'>
              {mobilePageTickets.map((ticket) => (
                <TicketCardMobile
                  key={ticket.idTicket ?? ticket.ticket}
                  ticket={ticket}
                  onAssign={handleAssign}
                />
              ))}
            </div>
            {mobileTotalPages > 1 && (
              <div className='mt-3'>
                <MobilePagination
                  currentPage={mobilePage}
                  totalPages={mobileTotalPages}
                  total={sortedTickets.length}
                  pageSize={MOBILE_PAGE_SIZE}
                  onPageChange={setMobilePage}
                />
              </div>
            )}
          </>
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
            {downloadFilters && (
              <div className='flex items-center gap-2'>
                <select
                  value={downloadFormat}
                  onChange={(e) => setDownloadFormat(e.target.value as 'csv' | 'xlsx')}
                  className='text-xs rounded border border-(--border) bg-surface px-1.5 py-1 text-(--text-secondary)'
                >
                  <option value='xlsx'>XLSX</option>
                  <option value='csv'>CSV</option>
                </select>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className='flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60'
                >
                  {downloading ? (
                    <Loader2 size={14} className='animate-spin' />
                  ) : (
                    <Download size={14} />
                  )}
                  Download
                </button>
              </div>
            )}
          </div>

          {/* ← ADDED: Summary bar */}
          {tableSummary && (
            <TicketTableSummaryBar label='B2B Tickets' {...tableSummary} />
          )}

          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
                <tr>
                  {/* Checkbox all */}
                  <th className='w-12 px-3 py-2.5 text-center'>#</th>
                  {renderSortableHeader('Ticket', 'ticket')}
                  {renderSortableHeader('Service', 'serviceNo')}
                  {renderSortableHeader('Customer', 'contactName')}
                  <th className='px-3 py-2.5 text-center'>Address</th>
                  {renderSortableHeader('Booking Date', 'bookingDate')}
                  {renderSortableHeader('Type', 'customerType')}
                  <th className='px-3 py-2.5 text-center'>Max TTR</th>
                  {renderSortableHeader('Age / SLA', 'age')}
                  {renderSortableHeader('Jenis Tiket', 'jenisTiket')}
                  {renderSortableHeader('Workzone', 'workzone')}
                  {renderSortableHeader('Teknisi', 'technicianName')}
                  <th className='px-3 py-2.5 text-center'>Status</th>
                  {/* Action */}
                  <th className='px-3 py-2.5 text-center'>Aksi</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {loading ? (
                  <tr>
                    <td colSpan={15}>
                      <TableLoadingSkeleton rows={6} cols={15} />
                    </td>
                  </tr>
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

                    return (
                      <TicketRowB2B
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
            fetch(`/api/tickets/${expandedTicketId}/detail`)
              .then((r) => r.json())
              .then((d) => {
                if (d.success) setDrawerDetail(d.data);
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
