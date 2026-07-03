'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Pagination from '../../../components/tables/Pagination';
import MobilePagination from '../../../components/tables/MobilePagination';
import TicketRowB2B from './TicketRowB2B';
import TicketCardMobile from '../../../components/tickets/TicketCardMobile';
import TableEmptyState from '../../../components/tables/TableEmptyState';
import TicketDetailDrawer from './TicketDetailDrawer';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
} from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  calculateAgeInHours,
  formatAge,
  getTicketSeverity,
  sortByPriority,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import TicketTableSummaryBar from './TicketTableSummaryBar'; // ← ADDED
import {
  computeTtrCountdown,
  type TtrCountdown,
} from '@/app/hooks/useTtrCountdown';

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
    jenisTiket1?: string | null;
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
    rank?: number;
  }>;
  loading?: boolean;
  isRefreshing?: boolean;
  searching?: boolean;
  onAssign?: (ticketId: string | number) => void;
  onDetail?: (ticketId: string | number) => void;
  showBypassClose?: boolean;
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
  highlightQuery?: string;
  flaggingFilter?: string[];
  downloadFilters?: {
    dept: 'b2b' | 'b2c';
    ticketType?: string[];
    ticketGroup?: string[];
    operationalBucket?: string[];
    regulerOnly?: boolean;
    anomalyBucket?: string[];
    statusUpdate?: string[];
    ticketStatus?: string[];
    flagging?: string[];
    excludeSymptom?: string;
  };
  // Controlled sort (server-side)
  sortField?: SortField;
  sortOrder?: SortOrder;
  onSort?: (field: SortField, order: SortOrder) => void;
}

type TableTicket = NonNullable<AdminTicketTableB2BProps['tickets']>[number];

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

function TicketTableB2BLoadingMobile() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading B2B ticket list'
    >
      <div className='space-y-3'>
        <div className='mb-2 flex items-center justify-between px-1'>
          <div className='h-3.5 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='h-3.5 w-20 rounded-full bg-slate-200 dark:bg-slate-800' />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950'
          >
            <div className='space-y-3'>
              <div className='flex items-start justify-between gap-3'>
                <div className='space-y-2'>
                  <div className='h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
                  <div className='h-3 w-40 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                </div>
                <div className='h-7 w-16 rounded-full bg-slate-100 dark:bg-slate-800' />
              </div>
              <div className='grid grid-cols-2 gap-2'>
                {Array.from({ length: 4 }).map((__, cellIndex) => (
                  <div
                    key={cellIndex}
                    className='rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60'
                  >
                    <div className='h-2.5 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='mt-2 h-3 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                ))}
              </div>
              <div className='flex gap-2'>
                <div className='h-8 flex-1 rounded-full bg-slate-200 dark:bg-slate-800' />
                <div className='h-8 w-24 rounded-full bg-slate-100 dark:bg-slate-800/80' />
              </div>
            </div>
          </div>
        ))}
      </div>
    </phantom-ui>
  );
}

function TicketTableB2BLoadingDesktop({ label }: { label: string }) {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label={`Loading ${label}`}
    >
      <div className='bg-surface overflow-hidden rounded-2xl border border-(--border) shadow-sm'>
        <div className='bg-surface-2 flex items-center justify-between border-b border-(--border) px-4 py-2'>
          <div className='h-3.5 w-32 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='flex items-center gap-2'>
            <div className='h-7 w-16 rounded-md bg-slate-200 dark:bg-slate-800' />
            <div className='h-7 w-24 rounded-md bg-slate-200 dark:bg-slate-800' />
          </div>
        </div>
        <div className='border-b border-(--border) px-4 py-3'>
          <div className='h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='mt-2 h-3 w-56 rounded-full bg-slate-100 dark:bg-slate-800/70' />
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
              <tr>
                <th className='w-12 px-3 py-2.5 text-center'>#</th>
                <th className='px-3 py-2.5 text-center'>Ticket</th>
                <th className='px-3 py-2.5 text-center'>Service</th>
                <th className='px-3 py-2.5 text-center'>Customer</th>
                <th className='px-3 py-2.5 text-center'>Address</th>
                <th className='px-3 py-2.5 text-center'>Booking Date</th>
                <th className='px-3 py-2.5 text-center'>Type</th>
                <th className='px-3 py-2.5 text-center whitespace-nowrap'>
                  Max TTR
                </th>
                <th className='px-3 py-2.5 text-center'>Age / SLA</th>
                <th className='px-3 py-2.5 text-center'>Jenis Tiket</th>
                <th className='px-3 py-2.5 text-center'>Workzone</th>
                <th className='px-3 py-2.5 text-center'>Teknisi</th>
                <th className='px-3 py-2.5 text-center'>Status Insera</th>
                <th className='px-3 py-2.5 text-center'>Status Dompis</th>
                <th className='px-3 py-2.5 text-center'>Aksi</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-(--border)'>
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr key={rowIndex} className='odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-950 dark:even:bg-slate-900/60'>
                  <td className='px-3 py-4'>
                    <div className='h-3.5 w-6 rounded-full bg-slate-200 dark:bg-slate-800' />
                  </td>
                  {Array.from({ length: 14 }).map((__, cellIndex) => (
                    <td key={cellIndex} className='px-3 py-4'>
                      <div className='space-y-2'>
                        <div className='h-3 w-5/6 rounded-full bg-slate-200 dark:bg-slate-800' />
                        <div className='h-3 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function TicketTableB2B({
  tickets = [],
  loading = false,
  isRefreshing = false,
  searching = false,
  onAssign,
  onDetail,
  showBypassClose = false,
  onBulkAssign,
  pagination,
  tableSummary,
  highlightQuery,
  downloadFilters,
  sortField: controlledSortField,
  sortOrder: controlledSortOrder,
  onSort,
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
  const normalizedHighlightQuery = (highlightQuery ?? '').trim().toLowerCase();

  const isHighlighted = useCallback(
    (ticket: TableTicket) => {
      if (!normalizedHighlightQuery) return false;
      const haystack = [
        ticket.ticket,
        ticket.serviceNo,
        ticket.contactName,
        ticket.summary,
        ticket.workzone,
        ticket.customerType,
        ticket.jenisTiket,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .filter(Boolean);

      return haystack.some((value) => value.includes(normalizedHighlightQuery));
    },
    [normalizedHighlightQuery],
  );

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
      for (const g of downloadFilters.ticketGroup ?? []) {
        params.append('ticketGroup', g);
      }
      for (const bucket of downloadFilters.operationalBucket ?? []) {
        params.append('operationalBucket', bucket);
      }
      if (typeof downloadFilters.regulerOnly === 'boolean') {
        params.set('regulerOnly', downloadFilters.regulerOnly ? 'true' : 'false');
      }
      if (downloadFilters.excludeSymptom) {
        params.set('excludeSymptom', downloadFilters.excludeSymptom);
      }
      for (const bucket of downloadFilters.anomalyBucket ?? []) {
        params.append('anomalyBucket', bucket);
      }
      for (const s of downloadFilters.statusUpdate ?? []) {
        params.append('statusUpdate', s);
      }
      for (const s of downloadFilters.ticketStatus ?? []) {
        params.append('ticketStatus', s);
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
    if (onSort && controlledSortField !== undefined) {
      const newOrder = controlledSortField === field && controlledSortOrder === 'asc' ? 'desc' : 'asc';
      onSort(field, newOrder);
    } else {
      setSortConfig((prev) => ({
        field,
        order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
      }));
    }
  }, [onSort, controlledSortField, controlledSortOrder]);

  const toggleExpand = useCallback((ticketId: number | string) => {
    const numericId = Number(ticketId);
    if (!Number.isFinite(numericId)) return;
    setExpandedTicketId((prev) => (prev === numericId ? null : numericId));
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

  const activeSortField = controlledSortField ?? sortConfig.field;
  const activeSortOrder = controlledSortOrder ?? sortConfig.order;

  const sortedTickets = useMemo(() => {
    if (!tickets.length) return tickets;
    if (onSort && controlledSortField !== undefined && controlledSortField !== 'priority') {
      return tickets;
    }
    if (activeSortField === 'priority') return sortByPriority(tickets);
    return [...tickets].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      if (activeSortField === 'age') {
        aVal = calculateAgeInHours(
          a.reportedDate,
          a.statusUpdate,
          a.closedAt,
          a.status,
        );
        bVal = calculateAgeInHours(
          b.reportedDate,
          b.statusUpdate,
          b.closedAt,
          b.status,
        );
      } else {
        aVal = a[activeSortField as keyof typeof a];
        bVal = b[activeSortField as keyof typeof b];
      }
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (aVal < bVal) return activeSortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return activeSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tickets, activeSortField, activeSortOrder, onSort, controlledSortField]);

  const currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.limit ?? 10;
  const pageOffset = (currentPage - 1) * pageSize;
  const isServerPaginated =
    !!pagination && pagination.total > sortedTickets.length;
  const pageTickets =
    pagination && !isServerPaginated
      ? sortedTickets.slice(pageOffset, pageOffset + pageSize)
      : sortedTickets;

  const MOBILE_PAGE_SIZE = 5;
  const mobileTotalPages = Math.max(
    1,
    Math.ceil(sortedTickets.length / MOBILE_PAGE_SIZE),
  );
  const mobilePageTickets = sortedTickets.slice(
    (mobilePage - 1) * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE,
  );

  const ticketCountdowns = useMemo(() => {
    const map = new Map<number, TtrCountdown | null>();
    for (const ticket of tickets) {
      if (typeof ticket.idTicket !== 'number') continue;
      map.set(ticket.idTicket, computeTtrCountdown(ticket));
    }
    return map;
  }, [tickets]);
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
          currentField={activeSortField}
          order={activeSortOrder}
        />
      </div>
    </th>
  );

  return (
    <div className='space-y-3'>
      {/* ── Bulk action bar (appears when rows are selected) ── */}

      {/* Mobile */}
      <div className='block lg:hidden'>
        {loading && !isRefreshing ? (
          searching ? (
            <div className='flex min-h-56 items-center justify-center rounded-2xl border border-(--border) bg-(--surface) text-(--text-secondary)'>
              <div className='flex items-center gap-2 rounded-full border border-(--border) bg-(--surface-2) px-4 py-2 text-sm font-semibold'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Mencari tiket...
              </div>
            </div>
          ) : (
            <TicketTableB2BLoadingMobile />
          )
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-(--text-secondary)'>
            No tickets found
          </p>
        ) : (
          <>
            <div className='mb-2 flex items-center justify-between px-1'>
              <p className='text-xs text-(--text-secondary)'>
                {(mobilePage - 1) * MOBILE_PAGE_SIZE + 1}–
                {Math.min(mobilePage * MOBILE_PAGE_SIZE, sortedTickets.length)}{' '}
                dari {sortedTickets.length} tiket
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
                  highlighted={isHighlighted(ticket)}
                  showBypassClose={showBypassClose}
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
        {loading && !isRefreshing ? (
          searching ? (
            <div className='flex min-h-72 items-center justify-center rounded-2xl border border-(--border) bg-(--surface) text-(--text-secondary) shadow-sm'>
              <div className='flex items-center gap-2 rounded-full border border-(--border) bg-(--surface-2) px-5 py-2.5 text-sm font-semibold'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Mencari tiket...
              </div>
            </div>
          ) : (
            <TicketTableB2BLoadingDesktop label='B2B tickets' />
          )
        ) : (
          <div className='bg-surface overflow-hidden rounded-2xl border border-(--border) shadow-sm'>
            <div className='bg-surface-2 flex items-center justify-between border-b border-(--border) px-4 py-2'>
              <p className='text-xs text-(--text-secondary)'>
                {pagination?.total ?? sortedTickets.length} tiket
              </p>
              {downloadFilters && (
                <div className='flex items-center gap-2'>
                  <select
                    value={downloadFormat}
                    onChange={(e) =>
                      setDownloadFormat(e.target.value as 'csv' | 'xlsx')
                    }
                    className='bg-surface rounded border border-(--border) px-1.5 py-1 text-xs text-(--text-secondary)'
                    suppressHydrationWarning
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

            {tableSummary && (
              <TicketTableSummaryBar label='B2B Tickets' {...tableSummary} />
            )}

            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
                  <tr>
                    <th className='w-12 px-3 py-2.5 text-center'>#</th>
                    {renderSortableHeader('Ticket', 'ticket')}
                    {renderSortableHeader('Service', 'serviceNo')}
                    {renderSortableHeader('Customer', 'contactName')}
                    <th className='px-3 py-2.5 text-center'>Address</th>
                    {renderSortableHeader('Booking Date', 'bookingDate')}
                    {renderSortableHeader('Type', 'customerType')}
                    <th className='px-3 py-2.5 text-center whitespace-nowrap'>
                      Max TTR
                    </th>
                    {renderSortableHeader('Age / SLA', 'age')}
                    {renderSortableHeader('Jenis Tiket', 'jenisTiket')}
                    {renderSortableHeader('Workzone', 'workzone')}
                    {renderSortableHeader('Teknisi', 'technicianName')}
                    <th
                      className='px-3 py-2.5 text-center'
                      suppressHydrationWarning
                    >
                      Status Insera
                    </th>
                    <th
                      className='px-3 py-2.5 text-center'
                      suppressHydrationWarning
                    >
                      Status Dompis
                    </th>
                    <th className='px-3 py-2.5 text-center'>Aksi</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-(--border)'>
                  {sortedTickets.length === 0 ? (
                    <TableEmptyState
                      colSpan={15}
                      message='Tidak ada tiket ditemukan'
                    />
                  ) : (
                    pageTickets.map((ticket) => {
                      const ticketId = ticket.idTicket ?? ticket.ticket;
                      const isExpanded = expandedTicketId === ticketId;
                      const ttrCountdown =
                        ticketCountdowns.get(ticket.idTicket ?? -1) ?? null;
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
                      const ticketAge = formatAge(
                        ticket.reportedDate,
                        ticket.hasilVisit ?? ticket.statusUpdate,
                        ticket.closedAt,
                        ticket.status,
                      );
                      const ticketSeverity = getTicketSeverity(
                        ticket.reportedDate,
                        ticket.hasilVisit ?? ticket.statusUpdate,
                        ticket.closedAt,
                        ticket.status,
                      );

                      return (
                        <TicketRowB2B
                          key={ticketId}
                          ticket={ticket}
                          onAssign={handleAssign}
                          onDetail={onDetail}
                          showBypassClose={showBypassClose}
                          isExpanded={isExpanded}
                          onToggleExpand={toggleExpand}
                          rank={ticket.rank}
                          ticketAge={ticketAge}
                          severity={ticketSeverity}
                          slaLabel={slaLabel}
                          ttrCountdown={ttrCountdown}
                          highlighted={isHighlighted(ticket)}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className='bg-surface flex flex-col items-center gap-3 border-t border-(--border) px-5 py-3 sm:flex-row sm:justify-between'>
                <p className='text-xs text-(--text-secondary)'>
                  Showing{' '}
                  <span className='font-semibold text-(--text-primary)'>
                    {(pagination.currentPage - 1) * (pagination.limit ?? 10) +
                      1}
                    –
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
        )}
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
