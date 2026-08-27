'use client';

import { useState, useMemo, useCallback } from 'react';
import Pagination from '../../../components/tables/Pagination';
import TicketRowSemesta from './TicketRowSemesta';
import TableEmptyState from '../../../components/tables/TableEmptyState';
import TicketDetailDrawer from './TicketDetailDrawer';
import {
  ChevronDown,
  ChevronUp,
  Hash,
  MapPin,
  User,
  Clock3,
  Phone,
  Eye,
  Download,
  Loader2,
} from 'lucide-react';
import {
  calculateAgeInHours,
  getTicketSeverity,
  formatAge,
} from '@/app/libs/tickets/sort';
import { TicketCtype } from '@/app/types/ticket';
import Badge from '../../../components/ui/badge/Badge';
import CustomerTypeBadge from '../../../components/tickets/CustomerTypeBadge';
import {
  getStatusColor,
  getStatusLabel,
  getTicketAge,
  getTicketAgeColorClass,
} from '../../../components/tickets/helpers';
import { formatDate } from '../../../components/tickets/helpers';
import { computeTtrCountdown } from '@/app/hooks/useTtrCountdown';
import MaxTtrCell from './MaxTtrCell';
import { fetchWithAuth } from '@/app/libs/fetcher';

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
  tickets?: TicketRow[];
  loading?: boolean;
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit?: number;
    onPageChange: (page: number) => void;
  };
  downloadFilters?: {
    dept: 'all' | 'b2b' | 'b2c' | 'netral' | 'neutral';
    search?: string;
    workzone?: string;
    branch?: string;
    ctype?: string;
    ticketType?: string;
    statusUpdate?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface TicketRow {
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
  status_update?: string | null;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
}

interface SortConfig {
  field: SortField;
  order: SortOrder;
}

type DrawerTicket = {
  idTicket: number;
  ticket: string;
  summary: string;
  reportedDate: string;
  serviceNo: string;
  contactName: string;
  contactPhone: string;
  alamat?: string | null;
  bookingDate?: string;
  ctype?: TicketCtype;
  customerType?: string;
  customerSegment?: string;
  workzone?: string;
  status: string;
  hasilVisit?: 'OPEN' | 'ASSIGNED' | 'ON_PROGRESS' | 'PENDING' | 'ESCALATED' | 'CANCELLED' | 'CLOSE' | null;
  status_update?: string | null;
  jenisTiket?: string;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  pendingDompis?: string | null;
  rca?: string | null;
  subRca?: string | null;
  teknisiUserId?: number | null;
  technicianName?: string | null;
  closedAt?: string | null;
  ownerGroup?: string;
  deviceName?: string;
  symptom?: string;
  serviceType?: string;
  sourceTicket?: string;
} | null;

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
  statusInsera: 'Status Insera',
  statusDompis: 'Status Dompis',
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
  statusInsera: true,
  statusDompis: true,
};

function TicketTableSemestaLoadingMobile() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading semesta tickets'
    >
      <div className='space-y-3'>
        <div className='mb-2 flex items-center justify-between px-1'>
          <div className='h-3.5 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='h-3.5 w-20 rounded-full bg-slate-200 dark:bg-slate-800' />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className='rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='space-y-2'>
                <div className='h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
                <div className='h-3 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
              </div>
              <div className='h-7 w-16 rounded-full bg-slate-100 dark:bg-slate-800' />
            </div>
            <div className='mt-4 grid grid-cols-2 gap-2'>
              {Array.from({ length: 6 }).map((__, cellIndex) => (
                <div
                  key={cellIndex}
                  className='rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60'
                >
                  <div className='h-2.5 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
                  <div className='mt-2 h-3 w-4/5 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                </div>
              ))}
            </div>
            <div className='mt-3 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800' />
          </div>
        ))}
      </div>
    </phantom-ui>
  );
}

function TicketTableSemestaLoadingDesktop({ label }: { label: string }) {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label={`Loading ${label}`}
    >
      <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
        <div className='flex flex-col gap-3 border-b border-(--border) bg-(--surface-2) px-4 py-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='space-y-2'>
            <div className='h-3.5 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-3 w-56 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          </div>
          <div className='flex items-center gap-2'>
            <div className='h-9 w-24 rounded-2xl bg-slate-200 dark:bg-slate-800' />
            <div className='h-9 w-32 rounded-2xl bg-slate-200 dark:bg-slate-800' />
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
              <tr>
                <th className='w-10 px-3 py-3 text-center'>#</th>
                <th className='w-16 px-3 py-3 text-center'>No</th>
                <th className='px-3 py-3 text-center'>Ticket</th>
                <th className='px-3 py-3 text-center'>Service</th>
                <th className='px-3 py-3 text-center'>Customer</th>
                <th className='px-3 py-3 text-center'>Address</th>
                <th className='px-3 py-3 text-center'>Booking Date</th>
                <th className='px-3 py-3 text-center'>Type</th>
                <th className='px-3 py-3 text-center'>Max TTR</th>
                <th className='px-3 py-3 text-center'>Age / SLA</th>
                <th className='px-3 py-3 text-center'>Jenis Tiket</th>
                <th className='px-3 py-3 text-center'>Workzone</th>
                <th className='px-3 py-3 text-center'>Teknisi</th>
                <th className='px-3 py-3 text-center'>Status Insera</th>
                <th className='px-3 py-3 text-center'>Status Dompis</th>
                <th className='px-3 py-3 text-center'>Aksi</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-(--border)'>
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className='odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-950 dark:even:bg-slate-900/60'
                >
                  {Array.from({ length: 16 }).map((__, cellIndex) => (
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

export default function TicketTableSemesta({
  tickets = [],
  loading = false,
  pagination,
  downloadFilters,
}: AdminTicketTableSemestaProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'reportedDate',
    order: 'desc',
  });
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [visibleCols, setVisibleCols] =
    useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState<DrawerTicket>(null);
  const [downloadFormat, setDownloadFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [downloading, setDownloading] = useState(false);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const toggleExpand = useCallback((ticketId: number) => {
    setExpandedTicketId((prev) => (prev === ticketId ? null : ticketId));
  }, []);

  type TicketItem = TicketRow;

const handleOpenDrawer = useCallback((ticket: TicketItem) => {
    if (!ticket || !ticket.idTicket) return;
    setDrawerTicket({
      idTicket: ticket.idTicket,
      ticket: ticket.ticket ?? '',
      summary: ticket.summary ?? '',
      reportedDate: ticket.reportedDate ?? '',
      serviceNo: ticket.serviceNo ?? '',
      contactName: ticket.contactName ?? '',
      contactPhone: ticket.contactPhone ?? '',
      alamat: ticket.alamat ?? null,
      bookingDate: ticket.bookingDate ?? undefined,
      ctype: ticket.ctype,
      customerType: ticket.customerType ?? '',
      workzone: ticket.workzone ?? '',
      status: ticket.status_update ?? ticket.status_update ?? ticket.status ?? '',
      hasilVisit: (ticket.hasilVisit ?? null) as Exclude<DrawerTicket, null>['hasilVisit'],
      status_update: ticket.status_update ?? ticket.status_update ?? null,
      jenisTiket: ticket.jenisTiket ?? '',
      maxTtrReguler: ticket.maxTtrReguler ?? null,
      maxTtrGold: ticket.maxTtrGold ?? null,
      maxTtrPlatinum: ticket.maxTtrPlatinum ?? null,
      maxTtrDiamond: ticket.maxTtrDiamond ?? null,
      technicianName: ticket.technicianName ?? null,
      teknisiUserId: ticket.teknisiUserId ?? null,
      closedAt: ticket.closedAt ?? null,
    });
    setDrawerOpen(true);
  }, []);

  const currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.limit ?? 50;
  const hasDownload = Boolean(downloadFilters);

  const handleDownload = useCallback(async () => {
    if (!downloadFilters) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('format', downloadFormat);
      params.set('dept', downloadFilters.dept === 'neutral' ? 'netral' : downloadFilters.dept);

      if (downloadFilters.search) params.set('search', downloadFilters.search);
      if (downloadFilters.workzone) params.set('workzone', downloadFilters.workzone);
      if (downloadFilters.branch) params.set('branch', downloadFilters.branch);
      if (downloadFilters.ctype) params.set('ctype', downloadFilters.ctype);
      if (downloadFilters.ticketType) params.set('ticketType', downloadFilters.ticketType);
      if (downloadFilters.statusUpdate) params.set('statusUpdate', downloadFilters.statusUpdate);
      if (downloadFilters.startDate) params.set('startDate', downloadFilters.startDate);
      if (downloadFilters.endDate) params.set('endDate', downloadFilters.endDate);

      const res = await fetchWithAuth(`/api/tickets/export?${params.toString()}`, {
        timeoutMs: 120_000,
      });
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
      a.download = `Tiket_SEMESTA_${downloadFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message ?? 'Export gagal');
    } finally {
      setDownloading(false);
    }
  }, [downloadFilters, downloadFormat]);

  const pageTickets = tickets;

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

  const sortedTickets = useMemo(() => {
    if (!pageTickets.length) return pageTickets;
    return [...pageTickets].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      if (sortConfig.field === 'age') {
        aVal = calculateAgeInHours(a.reportedDate, a.hasilVisit, a.closedAt, a.status);
        bVal = calculateAgeInHours(b.reportedDate, b.hasilVisit, b.closedAt, b.status);
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
  }, [pageTickets, sortConfig]);

  const rowOffset = 0;

  return (
    <div className='space-y-4'>
      {/* Mobile */}
      <div className='block space-y-3 lg:hidden'>
        {loading ? (
          <TicketTableSemestaLoadingMobile />
        ) : sortedTickets.length === 0 ? (
          <p className='py-8 text-center text-(--text-secondary)'>
            No tickets found
          </p>
        ) : (
          <>
            {sortedTickets.map((ticket) => {
              return (
                <div
                  key={ticket.idTicket ?? ticket.ticket}
                  className='group rounded-3xl border border-(--border) bg-(--surface) p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400/20 hover:shadow-md sm:p-4'
                >
                  <div className='flex items-start justify-between gap-2 sm:gap-3'>
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
                              <p className='truncate text-sm font-semibold text-(--text-primary)'>
                                {ticket.ticket || '-'}
                              </p>
                              <span className='text-xs text-(--text-muted)'>
                                {ticket.reportedDate
                                  ? formatDate(ticket.reportedDate)
                                  : '-'}
                              </span>
                            </div>
                            <p className='mt-1 truncate text-sm text-(--text-secondary)'>
                              {ticket.summary || '-'}
                            </p>
                          </div>

                          <div className='flex shrink-0 flex-col items-end gap-1'>
                            <Badge
                              size='sm'
                              color={getStatusColor(ticket.hasilVisit || '')}
                            >
                              {ticket.hasilVisit || '-'}
                            </Badge>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTicketAgeColorClass(ticket)}`}
                            >
                              {getTicketAge(ticket)}
                            </span>
                          </div>
                        </div>

                        <div className='mt-3 grid grid-cols-1 gap-2 text-xs text-(--text-secondary) sm:grid-cols-2'>
                          <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
                            <Hash className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
                            <div className='min-w-0'>
                              <p className='text-[11px] text-(--text-muted)'>Service</p>
                              <p className='truncate font-semibold'>
                                {ticket.serviceNo || '-'}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
                            <MapPin className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
                            <div className='min-w-0'>
                              <p className='text-[11px] text-(--text-muted)'>Workzone</p>
                              <p className='truncate font-semibold'>
                                {ticket.workzone || '-'}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
                            <User className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
                            <div className='min-w-0'>
                              <p className='text-[11px] text-(--text-muted)'>Type</p>
                              <CustomerTypeBadge ctype={ticket.ctype} size='sm' />
                            </div>
                          </div>
                          <div className='flex items-center gap-2 rounded-2xl border border-(--border) bg-(--bg) px-2.5 py-2'>
                            <Clock3 className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
                            <div className='min-w-0'>
                              <p className='text-[11px] text-(--text-muted)'>Max TTR</p>
                              <MaxTtrCell ticket={ticket} />
                            </div>
                          </div>
                        </div>

                        <div className='mt-3 flex flex-col gap-2 rounded-2xl border border-(--border) bg-(--bg) p-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3 sm:py-2'>
                          <div className='min-w-0'>
                            <p className='text-[11px] text-(--text-muted)'>Customer</p>
                            <p className='truncate text-sm font-semibold text-(--text-primary)'>
                              {ticket.contactName || '-'}
                            </p>
                          </div>
                          <div className='min-w-0 text-right sm:shrink-0'>
                            <p className='text-[11px] text-(--text-muted)'>Phone</p>
                            <p className='inline-flex items-center gap-1 text-sm font-medium text-(--text-secondary)'>
                              <Phone className='h-3.5 w-3.5 text-(--text-muted) sm:h-4 sm:w-4' />
                              <span className='tabular-nums'>
                                {ticket.contactPhone || '-'}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className='mt-3 flex items-center justify-between gap-3'>
                          <div className='min-w-0 flex-1'>
                            <p className='text-[11px] text-(--text-muted)'>Technician</p>
                            <p className='truncate text-sm font-medium text-(--text-primary)'>
                              {ticket.technicianName || (
                                <span className='italic text-(--text-muted)'>
                                  Unassigned
                                </span>
                              )}
                            </p>
                            <p className='mt-0.5 text-xs text-(--text-muted)'>
                              Jenis tiket: {ticket.jenisTiket || '-'}
                            </p>
                            <div className='mt-2 flex flex-wrap gap-2'>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase badge-${getStatusColor(ticket.status || '')}`}
                              >
                                Insera: {getStatusLabel(ticket.status || '')}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase badge-${getStatusColor(ticket.status_update || '')}`}
                              >
                                Dompis:{' '}
                                {getStatusLabel(ticket.status_update || '')}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenDrawer(ticket)}
                            className='flex shrink-0 items-center gap-1.5 rounded-2xl border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text-secondary) transition hover:border-blue-300 hover:bg-blue-500/5 hover:text-blue-600'
                          >
                            <Eye size={13} />
                            Detail
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
        )}
      </div>

      {/* Desktop */}
      <div className='hidden lg:block'>
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          {/* Table toolbar */}
          <div className='flex flex-col gap-3 border-b border-(--border) bg-(--surface-2) px-4 py-4 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Live Table
              </p>
              <p className='mt-0.5 text-xs text-(--text-secondary)'>
                {pagination?.total ?? sortedTickets.length} tiket in the current scope
              </p>
            </div>

            {hasDownload && (
              <div className='flex flex-wrap items-center gap-2'>
                <select
                  value={downloadFormat}
                  onChange={(e) =>
                    setDownloadFormat(e.target.value as 'csv' | 'xlsx')
                  }
                  className='h-9 rounded-2xl border border-(--border) bg-(--surface) px-3 text-xs font-semibold text-(--text-primary) outline-none'
                >
                  <option value='csv'>CSV</option>
                  <option value='xlsx'>XLSX</option>
                </select>
                <button
                  type='button'
                  onClick={handleDownload}
                  disabled={downloading}
                  className='inline-flex h-9 items-center gap-2 rounded-2xl bg-blue-600 px-3.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {downloading ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Download className='h-3.5 w-3.5' />
                  )}
                  Download
                </button>
              </div>
            )}
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
                  {visibleCols.statusInsera && (
                    <th className='px-3 py-3 text-center'>Status Insera</th>
                  )}
                  {visibleCols.statusDompis && (
                    <th className='px-3 py-3 text-center'>Status Dompis</th>
                  )}
                  {/* Detail column */}
                  <th className='px-3 py-3 text-center'>Aksi</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {loading ? (
                  <tr>
                    <td colSpan={16}>
                      <TicketTableSemestaLoadingDesktop label='semesta tickets' />
                    </td>
                  </tr>
                ) : sortedTickets.length === 0 ? (
                  <TableEmptyState
                    colSpan={16}
                    message='Tidak ada tiket ditemukan'
                  />
                ) : (
                  sortedTickets.map((ticket, idx) => {
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
                    const globalIndex = idx + 1;

                    return (
                      <TicketRowSemesta
                        key={ticketId}
                        ticket={ticket}
                        isExpanded={isExpanded}
                        onToggleExpand={() => {
                          if (ticket.idTicket) {
                            handleOpenDrawer(ticket);
                          } else {
                            toggleExpand(ticketId as number);
                          }
                        }}
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

      {/* TicketDetailDrawer */}
      <TicketDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ticket={drawerTicket}
        loading={false}
        error={null}
      />
    </div>
  );
}
