'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import type { Ticket as DailyTicket } from '@/app/types/ticket';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import { queryKeys } from '@/app/libs/query-keys';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type { DateRange } from 'react-day-picker';
import DateRangePicker from '@/app/admin/semesta/components/filters/DateRangePicker';
import TicketTable from './TicketTable';
import TicketTableB2B from './TicketTableB2B';
import TicketTableTabs from './TicketTableTabs';
import { FilterBarB2B } from './filterbarb2b';
import { FilterBarB2C } from './filterbarb2c';
import TicketTableValidasi from './TicketTableValidasi';
import {
  FlaggingSummaryRow,
  TicketTypeBreakdownStrip,
} from './TicketBreakdownComponents';

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

type BucketPageProps = {
  title: string;
  description: string;
  icon: string;
  tone: 'blue' | 'emerald' | 'amber' | 'slate' | 'purple';
  operationalBucket?: string[];
  regulerOnly?: boolean;
  anomalyBucket?: string[];
  ticketTypeFilter?: string[];
  statusUpdateFilter?: string[];
  ticketStatusFilter?: string[];
  flaggingFilter?: string[];
  showDateFilter?: boolean;
  disableLocalSearch?: boolean;
  extraWorkboard?: {
    title: string;
    description: string;
    tableLabel: string;
    symptom: string;
    dept?: 'all' | 'b2b' | 'b2c';
  };
  headerSlot?: ReactNode;
  initialWorkzone?: string;
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

const TONE_CLASSES: Record<BucketPageProps['tone'], string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  emerald:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  purple:
    'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
};

export default function TicketManagementBucketPage({
  title,
  description,
  icon,
  tone,
  operationalBucket = [],
  regulerOnly,
  anomalyBucket = [],
  ticketTypeFilter = [],
  statusUpdateFilter = [],
  ticketStatusFilter = [],
  flaggingFilter = [],
  showDateFilter,
  disableLocalSearch = false,
  extraWorkboard,
  headerSlot,
  initialWorkzone = '',
}: BucketPageProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const { workzone: workzoneFilter, setWorkzone: setWorkzoneFilter } =
    usePersistentWorkzoneScope(initialWorkzone);
  const [dateRange, setDateRange] = useState<DateRange>();
  const isUnspecBucket = operationalBucket.includes('non_kpi_unspec');
  const canBypassClose =
    operationalBucket.includes('kpi_proactive') ||
    operationalBucket.includes('sqm_update');
  const [activeTab, setActiveTab] = useState<
    'semua' | 'unspecOhi' | 'b2c' | 'b2b' | 'validasi' | 'close' | 'gamas'
  >('semua');
  const [extraWorkboardPage, setExtraWorkboardPage] = useState(1);
  const [b2cPage, setB2cPage] = useState(1);
  const [b2bPage, setB2bPage] = useState(1);
  const [semuaPage, setSemuaPage] = useState(1);
  const [closePage, setClosePage] = useState(1);
  const [gamasPage, setGamasPage] = useState(1);
  const [b2cValidasiPage, setB2cValidasiPage] = useState(1);
  const [b2bValidasiPage, setB2bValidasiPage] = useState(1);
  const [b2cTicketTypeFilter, setB2cTicketTypeFilter] = useState<string[]>([]);
  const [b2cHasilVisitFilter, setB2cHasilVisitFilter] = useState<string[]>([]);
  const [b2cTicketStatusFilter, setB2cTicketStatusFilter] = useState<string[]>(
    [],
  );
  const [b2cFlaggingFilter, setB2cFlaggingFilter] = useState<string[]>([]);
  const [b2bTicketTypeFilter, setB2bTicketTypeFilter] = useState<string[]>([]);
  const [b2bHasilVisitFilter, setB2bHasilVisitFilter] = useState<string[]>([]);
  const [b2bTicketStatusFilter, setB2bTicketStatusFilter] = useState<string[]>(
    [],
  );
  const [b2bFlaggingFilter, setB2bFlaggingFilter] = useState<string[]>([]);
  const [b2cSortField, setB2cSortField] = useState<string | undefined>(
    undefined,
  );
  const [b2cSortOrder, setB2cSortOrder] = useState<'asc' | 'desc'>('desc');
  const [b2bSortField, setB2bSortField] = useState<string | undefined>(
    undefined,
  );
  const [b2bSortOrder, setB2bSortOrder] = useState<'asc' | 'desc'>('desc');
  const [semuaSortField, setSemuaSortField] = useState<string | undefined>(
    undefined,
  );
  const [semuaSortOrder, setSemuaSortOrder] = useState<'asc' | 'desc'>('desc');
  const [unspecSortField, setUnspecSortField] = useState<string | undefined>(
    undefined,
  );
  const [unspecSortOrder, setUnspecSortOrder] = useState<'asc' | 'desc'>(
    'desc',
  );
  const [closeSortField, setCloseSortField] = useState<string | undefined>(
    undefined,
  );
  const [closeSortOrder, setCloseSortOrder] = useState<'asc' | 'desc'>('desc');
  const [gamasSortField, setGamasSortField] = useState<string | undefined>(
    undefined,
  );
  const [gamasSortOrder, setGamasSortOrder] = useState<'asc' | 'desc'>('desc');
  const [validasiDownloadFormat, setValidasiDownloadFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [validasiDownloading, setValidasiDownloading] = useState(false);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );
  const [focusedTicket, setFocusedTicket] = useState<DailyTicket | null>(null);
  const b2cTableRef = useRef<HTMLDivElement>(null);
  const b2bTableRef = useRef<HTMLDivElement>(null);
  const extraWorkboardTableRef = useRef<HTMLDivElement>(null);
  const validasiTableRef = useRef<HTMLDivElement>(null);
  const semuaTableRef = useRef<HTMLDivElement>(null);
  const closeTableRef = useRef<HTMLDivElement>(null);
  const gamasTableRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const routeSearchQuery = searchParams.get('search') || '';
  const focusTicketId = useMemo(() => {
    const value = Number(searchParams.get('ticketId') || 0);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }, [searchParams]);
  const isFocusedTicketMode = Boolean(focusTicketId);
  const defaultTicketPageLimit = isFocusedTicketMode ? 10 : 50;
  const effectiveSearchQuery = searchQuery.trim() || routeSearchQuery.trim();
  const normalizedSearchQuery = effectiveSearchQuery.toLowerCase();

  const scrollSectionToSearchHit = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return;
      window.requestAnimationFrame(() => {
        const hit = container.querySelector<HTMLElement>(
          '[data-search-highlight="true"]',
        );
        if (hit) {
          hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [],
  );

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setSearchQuery(urlSearch);
  }, [searchParams]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (
      urlTab === 'semua' ||
      urlTab === 'unspecOhi' ||
      urlTab === 'b2c' ||
      urlTab === 'b2b' ||
      urlTab === 'validasi' ||
      urlTab === 'close' ||
      urlTab === 'gamas'
    ) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!focusTicketId || !operationalBucket.includes('kpi_customer')) {
      setFocusedTicket(null);
      return;
    }

    let cancelled = false;

    const loadFocusedTicket = async () => {
      setFocusedTicket(null);
      const res = await fetchWithAuth(`/api/tickets/${focusTicketId}/detail`);
      if (!res) return;
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data || cancelled) return;
      setFocusedTicket(json.data as DailyTicket);
    };

    void loadFocusedTicket();

    return () => {
      cancelled = true;
    };
  }, [focusTicketId, operationalBucket]);

  useEffect(() => {
    if (activeTab === 'semua') {
      setB2cPage(1);
      setB2bPage(1);
      setSemuaPage(1);
      setSemuaSortField(undefined);
      setSemuaSortOrder('desc');
    }
    if (activeTab === 'b2c') {
      setB2cSortField(undefined);
      setB2cSortOrder('desc');
    }
    if (activeTab === 'b2b') {
      setB2bSortField(undefined);
      setB2bSortOrder('desc');
    }
    if (activeTab === 'unspecOhi') {
      setUnspecSortField(undefined);
      setUnspecSortOrder('desc');
    }
    if (activeTab === 'close') {
      setCloseSortField(undefined);
      setCloseSortOrder('desc');
    }
    if (activeTab === 'gamas') {
      setGamasSortField(undefined);
      setGamasSortOrder('desc');
    }
  }, [activeTab]);

  const startDateStr = dateRange?.from
    ? format(dateRange.from, 'yyyy-MM-dd')
    : undefined;
  const endDateStr = dateRange?.to
    ? format(dateRange.to, 'yyyy-MM-dd')
    : undefined;

  const SEMUA_PAGE_SIZE = 15;

  const sharedFilters = {
    search: effectiveSearchQuery,
    ticketId: focusTicketId,
    workzone: workzoneFilter || undefined,
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    // excludeSymptom: extraWorkboard?.symptom,
    includeValidasi: true,
    startDate: startDateStr,
    endDate: endDateStr,
  } as const;
  const fetchDailyOptions = activeTab === 'b2c' || activeTab === 'b2b';
  const fetchValidasiTickets =
    fetchDailyOptions ||
    activeTab === 'validasi' ||
    Boolean(effectiveSearchQuery);

  const b2cPageData = useDailyTicketPage({
    ...sharedFilters,
    excludeSymptom: extraWorkboard?.symptom,
    dept: 'b2c',
    ticketType: [...ticketTypeFilter, ...b2cTicketTypeFilter],
    statusUpdate: [...statusUpdateFilter, ...b2cHasilVisitFilter],
    ticketStatus: [...ticketStatusFilter, ...b2cTicketStatusFilter],
    flagging: [...flaggingFilter, ...b2cFlaggingFilter],
    page: b2cPage,
    limit: activeTab === 'semua' ? defaultTicketPageLimit : 10,
    validasiPage: b2cValidasiPage,
    enabled: activeTab !== 'b2b',
    includeOptions: fetchDailyOptions,
    includeValidasiTickets: fetchValidasiTickets,
    sortField: b2cSortField,
    sortOrder: b2cSortOrder,
  });

  const b2bPageData = useDailyTicketPage({
    ...sharedFilters,
    excludeSymptom: extraWorkboard?.symptom,
    dept: 'b2b',
    ticketType: [...ticketTypeFilter, ...b2bTicketTypeFilter],
    statusUpdate: [...statusUpdateFilter, ...b2bHasilVisitFilter],
    ticketStatus: [...ticketStatusFilter, ...b2bTicketStatusFilter],
    flagging: [...flaggingFilter, ...b2bFlaggingFilter],
    page: b2bPage,
    limit: activeTab === 'semua' ? defaultTicketPageLimit : 10,
    validasiPage: b2bValidasiPage,
    enabled: activeTab !== 'b2c',
    includeOptions: fetchDailyOptions,
    includeValidasiTickets: fetchValidasiTickets,
    sortField: b2bSortField,
    sortOrder: b2bSortOrder,
  });

  const extraWorkboardPageData = useDailyTicketPage({
    search: effectiveSearchQuery,
    symptom: extraWorkboard?.symptom,
    workzone: workzoneFilter || undefined,
    dept: extraWorkboard?.dept ?? 'all',
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: ticketStatusFilter,
    flagging: flaggingFilter,
    includeValidasi: false,
    includeValidasiTickets: false,
    includeOptions: false,
    startDate: startDateStr,
    endDate: endDateStr,
    page: extraWorkboardPage,
    limit: 10,
    enabled:
      Boolean(extraWorkboard) &&
      (activeTab === 'semua' || (isUnspecBucket && activeTab === 'unspecOhi')),
    sortField: unspecSortField,
    sortOrder: unspecSortOrder,
  });

  const closePageData = useDailyTicketPage({
    search: effectiveSearchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'all',
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    // excludeSymptom: extraWorkboard?.symptom,
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: CLOSE_STATUS_VALUES,
    flagging: flaggingFilter,
    includeValidasi: false,
    includeValidasiTickets: false,
    includeOptions: false,
    includeClosed: true,
    page: closePage,
    limit: 15,
    enabled: true,
    sortField: closeSortField,
    sortOrder: closeSortOrder,
  });

  const semuaPageData = useDailyTicketPage({
    ...sharedFilters,
    excludeSymptom: extraWorkboard?.symptom,
    dept: 'all',
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: ticketStatusFilter,
    flagging: flaggingFilter,
    page: semuaPage,
    limit: SEMUA_PAGE_SIZE,
    enabled: activeTab === 'semua',
    includeOptions: false,
    includeValidasiTickets: false,
    sortField: semuaSortField,
    sortOrder: semuaSortOrder,
  });

  const gamasPageData = useDailyTicketPage({
    ...sharedFilters,
    dept: 'all',
    ticketType: ticketTypeFilter,
    statusUpdate: statusUpdateFilter,
    ticketStatus: ticketStatusFilter,
    flagging: flaggingFilter,
    gamasOnly: true,
    page: gamasPage,
    limit: 15,
    enabled: true,
    includeValidasi: false, //tambah ini terakhir
    includeOptions: false,
    includeValidasiTickets: false,
    sortField: gamasSortField,
    sortOrder: gamasSortOrder,
  });

  const totals = useMemo(() => {
    const b2c = b2cPageData.summary;
    const b2b = b2bPageData.summary;
    const extra = extraWorkboardPageData.summary;
    return {
      total: (b2c.total ?? 0) + (b2b.total ?? 0) + (extra.total ?? 0),
      open: (b2c.open ?? 0) + (b2b.open ?? 0) + (extra.open ?? 0),
      assigned:
        (b2c.assigned ?? 0) + (b2b.assigned ?? 0) + (extra.assigned ?? 0),
      close: closePageData.pagination.total,
      ffgCount:
        (b2c.ffgCount ?? 0) + (b2b.ffgCount ?? 0) + (extra.ffgCount ?? 0),
      gamasCount:
        (b2c.gamasCount ?? 0) + (b2b.gamasCount ?? 0) + (extra.gamasCount ?? 0),
      p1Count: (b2c.p1Count ?? 0) + (b2b.p1Count ?? 0) + (extra.p1Count ?? 0),
      pPlusCount:
        (b2c.pPlusCount ?? 0) + (b2b.pPlusCount ?? 0) + (extra.pPlusCount ?? 0),
    };
  }, [
    b2bPageData.summary,
    b2cPageData.summary,
    extraWorkboardPageData.summary,
    closePageData.pagination.total,
  ]);

  useEffect(() => {
    if (!effectiveSearchQuery.trim()) return;
    if (
      b2cPageData.loading ||
      b2bPageData.loading ||
      extraWorkboardPageData.loading ||
      closePageData.loading ||
      b2cPageData.isRefreshing ||
      b2bPageData.isRefreshing ||
      extraWorkboardPageData.isRefreshing ||
      closePageData.isRefreshing
    ) {
      return;
    }

    if (activeTab === 'semua') {
      scrollSectionToSearchHit(semuaTableRef.current);
      return;
    }
    if (activeTab === 'unspecOhi') {
      scrollSectionToSearchHit(extraWorkboardTableRef.current);
      return;
    }
    if (activeTab === 'b2c') {
      scrollSectionToSearchHit(b2cTableRef.current);
      return;
    }
    if (activeTab === 'b2b') {
      scrollSectionToSearchHit(b2bTableRef.current);
      return;
    }
    if (activeTab === 'validasi') {
      scrollSectionToSearchHit(validasiTableRef.current);
      return;
    }
    if (activeTab === 'close') {
      scrollSectionToSearchHit(closeTableRef.current);
      return;
    }
  }, [
    effectiveSearchQuery,
    activeTab,
    b2cPageData.loading,
    b2cPageData.isRefreshing,
    b2cPageData.pagination.total,
    b2bPageData.loading,
    b2bPageData.isRefreshing,
    b2bPageData.pagination.total,
    closePageData.loading,
    closePageData.isRefreshing,
    closePageData.pagination.total,
    extraWorkboardPageData.loading,
    extraWorkboardPageData.isRefreshing,
    extraWorkboardPageData.pagination.total,
    scrollSectionToSearchHit,
  ]);

  const activeRuleBadges = useMemo(() => {
    const badges: string[] = [];
    if (operationalBucket.includes('kpi_customer'))
      badges.push('Source CUSTOMER');
    if (operationalBucket.includes('kpi_proactive'))
      badges.push('Source PROACTIVE');
    if (operationalBucket.includes('non_kpi_unspec'))
      badges.push('Jenis Unspec / Non KPI');
    if (regulerOnly) badges.push('Jenis Tiket 1 = Reguler');
    if (anomalyBucket.includes('unknown')) badges.push('Unknown');
    if (anomalyBucket.includes('blank')) badges.push('Blank');
    return badges;
  }, [anomalyBucket, operationalBucket, regulerOnly]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setB2bPage(1);
      setB2cPage(1);
      setSemuaPage(1);
      setClosePage(1);

      const nextParams = new URLSearchParams(searchParams.toString());
      const trimmedQuery = query.trim();
      if (trimmedQuery) nextParams.set('search', trimmedQuery);
      else nextParams.delete('search');
      const nextUrl = nextParams.toString()
        ? `${pathname}?${nextParams.toString()}`
        : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setExtraWorkboardPage(1);
    setB2bPage(1);
    setB2cPage(1);
    setSemuaPage(1);
    setClosePage(1);
  }, []);

  const handleB2cTicketTypeChange = useCallback((types: string[]) => {
    setB2cTicketTypeFilter(types);
    setB2cPage(1);
  }, []);

  const handleB2cHasilVisitChange = useCallback((statuses: string[]) => {
    setB2cHasilVisitFilter(statuses);
    setB2cPage(1);
  }, []);

  const handleB2cTicketStatusChange = useCallback((statuses: string[]) => {
    setB2cTicketStatusFilter(statuses);
    setB2cPage(1);
  }, []);

  const handleB2cFlaggingChange = useCallback((flags: string[]) => {
    setB2cFlaggingFilter(flags);
    setB2cPage(1);
  }, []);

  const handleB2bTicketTypeChange = useCallback((types: string[]) => {
    setB2bTicketTypeFilter(types);
    setB2bPage(1);
  }, []);

  const handleB2bHasilVisitChange = useCallback((statuses: string[]) => {
    setB2bHasilVisitFilter(statuses);
    setB2bPage(1);
  }, []);

  const handleB2bTicketStatusChange = useCallback((statuses: string[]) => {
    setB2bTicketStatusFilter(statuses);
    setB2bPage(1);
  }, []);

  const handleB2bFlaggingChange = useCallback((flags: string[]) => {
    setB2bFlaggingFilter(flags);
    setB2bPage(1);
  }, []);

  const handleB2cSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setB2cSortField(field);
    setB2cSortOrder(order);
    setB2cPage(1);
  }, []);

  const handleB2bSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setB2bSortField(field);
    setB2bSortOrder(order);
    setB2bPage(1);
  }, []);

  const handleSemuaSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      setSemuaSortField(field);
      setSemuaSortOrder(order);
      setSemuaPage(1);
    },
    [],
  );

  const handleUnspecSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      setUnspecSortField(field);
      setUnspecSortOrder(order);
      setExtraWorkboardPage(1);
    },
    [],
  );

  const handleCloseSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      setCloseSortField(field);
      setCloseSortOrder(order);
      setClosePage(1);
    },
    [],
  );

  const handleGamasSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      setGamasSortField(field);
      setGamasSortOrder(order);
      setGamasPage(1);
    },
    [],
  );

  const handleValidasiDownload = useCallback(async () => {
    setValidasiDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('format', validasiDownloadFormat);
      params.set('validasiOnly', 'true');
      params.set('dept', 'all');
      for (const bucket of operationalBucket) params.append('operationalBucket', bucket);
      if (regulerOnly) params.set('regulerOnly', 'true');
      for (const bucket of anomalyBucket) params.append('anomalyBucket', bucket);
      if (dateRange?.from) params.set('startDate', dateRange.from.toISOString());
      if (dateRange?.to) params.set('endDate', dateRange.to.toISOString());
      if (effectiveSearchQuery) params.set('search', effectiveSearchQuery);

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
      a.download = `Tiket_Validasi_${validasiDownloadFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message ?? 'Export gagal');
    } finally {
      setValidasiDownloading(false);
    }
  }, [validasiDownloadFormat, dateRange, effectiveSearchQuery, operationalBucket, regulerOnly, anomalyBucket]);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === queryKeys.tickets.all[0],
      refetchType: 'active',
    });
  }, [queryClient]);

  useTicketEvents({
    onInvalidate: useCallback(() => {
      invalidateQueries();
    }, [invalidateQueries]),
    enabled: true,
  });

  const onAssign = useCallback(
    (ticketId: number | string, source: 'b2b' | 'b2c') => {
      const pageData = source === 'b2b' ? b2bPageData : b2cPageData;
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
    [b2bPageData, b2cPageData],
  );

  const onExtraAssign = useCallback(
    (ticketId: number | string) => {
      const ticket = extraWorkboardPageData.tickets.find(
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
    [extraWorkboardPageData.tickets],
  );

  const mergedTickets = semuaPageData.tickets;

  const mergedTotal = semuaPageData.pagination.total;

  const mergedTotalPages = semuaPageData.pagination.totalPages;

  const displayMergedTickets = mergedTickets;

  const onCombinedAssign = useCallback(
    (ticketId: number | string) => {
      const semuaTicket = semuaPageData.tickets.find(
        (t) => String(t.idTicket) === String(ticketId),
      );
      const b2cTicket = b2cPageData.tickets.find(
        (t) => String(t.idTicket) === String(ticketId),
      );
      onAssign(ticketId, b2cTicket || semuaTicket ? 'b2c' : 'b2b');
    },
    [semuaPageData.tickets, b2cPageData.tickets, onAssign],
  );

  const mergedSummary = semuaPageData.summary;

  const bucketKey = operationalBucket[0];
  const currentTabSearchHit = useMemo(() => {
    if (!normalizedSearchQuery) return false;

    const matchTicket = (ticket: DailyTicket) => {
      const ticketAny = ticket as DailyTicket & {
        customerName?: string | null;
        ticketIdGamas?: string | null;
      };
      const values = [
        ticketAny.ticket,
        ticketAny.summary,
        ticketAny.serviceNo,
        ticketAny.contactName,
        ticketAny.contactPhone,
        ticketAny.customerName,
        ticketAny.workzone,
        ticketAny.technicianName,
        ticketAny.status,
        ticketAny.status_update,
        ticketAny.ticketIdGamas,
      ]
        .map((value) =>
          String(value ?? '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

      return values.some((value) => value.includes(normalizedSearchQuery));
    };

    if (activeTab === 'semua') {
      return mergedTickets.some(matchTicket);
    }
    if (activeTab === 'unspecOhi') {
      return extraWorkboardPageData.tickets.some(matchTicket);
    }
    if (activeTab === 'b2c') {
      return b2cPageData.tickets.some(matchTicket);
    }
    if (activeTab === 'b2b') {
      return b2bPageData.tickets.some(matchTicket);
    }
    if (activeTab === 'validasi') {
      return [
        ...b2cPageData.validasiTickets,
        ...b2bPageData.validasiTickets,
      ].some(matchTicket);
    }
    if (activeTab === 'close') {
      return closePageData.tickets.some(matchTicket);
    }

    return false;
  }, [
    activeTab,
    b2bPageData.tickets,
    b2bPageData.validasiTickets,
    b2cPageData.tickets,
    b2cPageData.validasiTickets,
    closePageData.tickets,
    extraWorkboardPageData.tickets,
    mergedTickets,
    normalizedSearchQuery,
  ]);

  const validasiSearchHit = useMemo(() => {
    if (!normalizedSearchQuery) return false;

    const matchTicket = (ticket: DailyTicket) => {
      const ticketAny = ticket as DailyTicket & {
        customerName?: string | null;
        ticketIdGamas?: string | null;
      };
      const values = [
        ticketAny.ticket,
        ticketAny.summary,
        ticketAny.serviceNo,
        ticketAny.contactName,
        ticketAny.contactPhone,
        ticketAny.customerName,
        ticketAny.workzone,
        ticketAny.technicianName,
        ticketAny.status,
        ticketAny.status_update,
        ticketAny.ticketIdGamas,
      ]
        .map((value) =>
          String(value ?? '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

      return values.some((value) => value.includes(normalizedSearchQuery));
    };

    return [
      ...b2cPageData.validasiTickets,
      ...b2bPageData.validasiTickets,
    ].some(matchTicket);
  }, [
    b2bPageData.validasiTickets,
    b2cPageData.validasiTickets,
    normalizedSearchQuery,
  ]);

  const mergedLoading = semuaPageData.loading || semuaPageData.isRefreshing;
  const initialLoading =
    b2cPageData.loading ||
    b2bPageData.loading ||
    extraWorkboardPageData.loading;
  const searchLoading = Boolean(effectiveSearchQuery) && initialLoading;

  useEffect(() => {
    if (!normalizedSearchQuery) return;
    if (activeTab === 'validasi') return;
    if (validasiSearchHit) {
      setActiveTab('validasi');
      return;
    }
  }, [activeTab, normalizedSearchQuery, validasiSearchHit]);

  useEffect(() => {
    if (!normalizedSearchQuery) return;
    if (activeTab === 'close') return;
    if (validasiSearchHit) return;
    if (closePageData.loading || closePageData.isRefreshing) return;
    if (closePageData.pagination.total <= 0) return;
    if (currentTabSearchHit) return;
    setActiveTab('close');
  }, [
    activeTab,
    closePageData.isRefreshing,
    closePageData.loading,
    closePageData.pagination.total,
    currentTabSearchHit,
    normalizedSearchQuery,
    validasiSearchHit,
  ]);

  return (
    <>
      <AdminLayout
          onSearch={disableLocalSearch ? undefined : handleSearch}
          onWorkzoneChange={handleWorkzoneChange}
          selectedWorkzone={workzoneFilter}
        >
        <div className='space-y-5'>
          {searchLoading ? (
            <div className='flex min-h-72 items-center justify-center rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
              <div className='flex items-center gap-2 rounded-full border border-(--border) bg-(--surface-2) px-5 py-2.5 text-sm font-semibold text-(--text-secondary)'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Mencari tiket...
              </div>
            </div>
          ) : (
            <phantom-ui
              suppressHydrationWarning
              fallback-radius={8}
              loading={initialLoading}
              animation='shimmer'
              reveal={0.12}
              loading-label={`${title} loading`}
            >
              <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
                <div className='bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.72))] p-3 md:p-4 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.78))]'>
                  <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                    <div className='flex items-start gap-2.5'>
                      <div
                        className={clsx(
                          'grid h-10 w-10 place-items-center rounded-2xl text-[0.95rem] font-semibold uppercase shadow-sm ring-1 ring-white/10',
                          TONE_CLASSES[tone],
                        )}
                      >
                        {icon}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
                          Ticket Management
                        </p>
                        <h1 className='mt-1 text-[1.35rem] leading-none font-semibold tracking-[-0.03em] text-(--text-primary) md:text-[1.6rem]'>
                          {title}
                        </h1>
                        <p className='mt-1.5 max-w-2xl text-[13px] leading-5 text-(--text-secondary)'>
                          {description}
                        </p>
                        <div className='mt-2.5 flex flex-wrap gap-1.5'>
                          {activeRuleBadges.map((badge) => (
                            <span
                              key={badge}
                              className='rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-0.5 text-[9px] font-bold tracking-[0.16em] text-(--text-secondary) uppercase'
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                        {!disableLocalSearch && (
                          <div className='mt-3 flex max-w-2xl items-center gap-2 rounded-2xl border border-(--border) bg-(--surface) p-1.5 shadow-sm'>
                            <div className='relative flex-1'>
                              <input
                                type='search'
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder='Search incident, ticket, customer, service...'
                                className='h-10 w-full rounded-xl border border-(--border) bg-(--surface-2) px-3.5 pr-10 text-sm font-medium text-(--text-primary) outline-none placeholder:text-(--text-muted) focus:ring-2 focus:ring-blue-500/30'
                              />
                              {searchQuery.trim() && (
                                <button
                                  type='button'
                                  onClick={() => handleSearch('')}
                                  className='hover:bg-surface-2 absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-(--text-muted) transition-colors hover:text-(--text-primary)'
                                  aria-label='Clear search'
                                >
                                  <span className='text-lg leading-none'>
                                    ×
                                  </span>
                                </button>
                              )}
                            </div>
                            <span className='hidden shrink-0 text-xs font-semibold text-(--text-muted) lg:inline'>
                              Search in this bucket
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {showDateFilter && (
                      <DateRangePicker
                        value={dateRange}
                        onChange={(range) => {
                          setDateRange(range);
                          setB2cPage(1);
                          setB2bPage(1);
                        }}
                        onClear={() => {
                          setDateRange(undefined);
                          setB2cPage(1);
                          setB2bPage(1);
                        }}
                        className='mt-3 lg:mt-0'
                      />
                    )}

                    <div className='grid grid-cols-2 gap-2 lg:min-w-70 lg:grid-cols-4'>
                      {[
                        ['Total', totals.total],
                        ['Open', totals.open],
                        ['Assigned', totals.assigned],
                        ['Close', totals.close],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className='rounded-2xl border border-(--border) bg-(--surface-2) px-2.5 py-2.5 text-center shadow-sm'
                        >
                          <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                            {label}
                          </p>
                          <p className='mt-0.5 text-[1rem] font-semibold text-(--text-primary) md:text-[1.1rem]'>
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className='mt-3 rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm'>
                    <div className='mb-2.5 flex items-center justify-between gap-2'>
                      <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
                        Flagging Summary
                      </p>
                      <span className='text-[10px] font-semibold text-(--text-muted)'>
                        Prioritas harian
                      </span>
                    </div>
                    <FlaggingSummaryRow counts={totals} />
                  </div>
                  {headerSlot && (
                    <div className='mt-3 rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm'>
                      {headerSlot}
                    </div>
                  )}
                </div>

                <div className='border-t border-(--border) bg-(--surface)'>
                  <div className='flex overflow-x-auto'>
                    {(
                      [
                        ['semua', 'Semua (Open)', totals.total],
                        ...(isUnspecBucket && extraWorkboard
                          ? [
                              [
                                'unspecOhi',
                                'Unspec OHI',
                                extraWorkboardPageData.pagination.total,
                              ] as const,
                            ]
                          : []),
                        ['b2c', 'B2C', b2cPageData.pagination.total],
                        ['b2b', 'B2B', b2bPageData.pagination.total],
                        [
                          'validasi',
                          'Validasi',
                          (b2cPageData.validasiCount ?? 0) +
                            (b2bPageData.validasiCount ?? 0),
                        ],
                        ['close', 'Close', closePageData.pagination.total],
                        [
                          'gamas',
                          'GAMAS (Open)',
                          gamasPageData.pagination.total,
                        ],
                      ] as const
                    ).map(([value, label, count]) => (
                      <button
                        key={value}
                        type='button'
                        onClick={() => setActiveTab(value)}
                        className={clsx(
                          'relative flex min-w-24 flex-1 flex-col items-center justify-center px-3 py-2.5 text-center text-[10px] font-bold tracking-[0.14em] uppercase transition-colors md:px-4',
                          activeTab === value
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-(--text-muted) hover:text-(--text-secondary)',
                        )}
                      >
                        <span className='whitespace-nowrap'>{label}</span>
                        <span
                          className={clsx(
                            'mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                            activeTab === value
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                              : 'bg-(--surface-2) text-(--text-muted)',
                          )}
                        >
                          {count.toLocaleString('id-ID')}
                        </span>
                        {activeTab === value && (
                          <span className='absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-blue-500' />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </phantom-ui>
          )}

          {activeTab === 'semua' && (
            <div className='space-y-5'>
              {extraWorkboard && !isUnspecBucket && (
                <div ref={extraWorkboardTableRef} className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                      {extraWorkboard.title}
                    </h2>
                    <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                      {extraWorkboardPageData.pagination.total} ticket
                    </span>
                  </div>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>
                    {extraWorkboard.description}
                  </p>
                  <TicketTable
                    tickets={extraWorkboardPageData.tickets}
                    tableLabel={extraWorkboard.tableLabel}
                    tableSummary={extraWorkboardPageData.summary}
                    loading={extraWorkboardPageData.loading}
                    isRefreshing={extraWorkboardPageData.isRefreshing}
                    searching={Boolean(effectiveSearchQuery)}
                    onAssign={onExtraAssign}
                    showBypassClose={canBypassClose}
                    highlightQuery={effectiveSearchQuery}
                    pagination={{
                      currentPage:
                        extraWorkboardPageData.pagination.currentPage,
                      totalPages: extraWorkboardPageData.pagination.totalPages,
                      total: extraWorkboardPageData.pagination.total,
                      limit: extraWorkboardPageData.pagination.limit,
                      onPageChange: setExtraWorkboardPage,
                    }}
                    downloadFilters={{
                      dept: extraWorkboard?.dept ?? 'all',
                      operationalBucket,
                      regulerOnly,
                      anomalyBucket,
                    }}
                    sortField={unspecSortField as any}
                    sortOrder={unspecSortOrder}
                    onSort={handleUnspecSort}
                  />
                </div>
              )}

              <div ref={semuaTableRef} className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                    Semua Workboard
                  </h2>
                  <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                    {mergedTotal} ticket
                  </span>
                </div>
                <TicketTable
                  tickets={displayMergedTickets}
                  tableSummary={mergedSummary}
                  loading={mergedLoading}
                  isRefreshing={mergedLoading}
                  searching={Boolean(effectiveSearchQuery)}
                  onAssign={onCombinedAssign}
                  showBypassClose={canBypassClose}
                  highlightQuery={effectiveSearchQuery}
                  pagination={{
                    currentPage: semuaPage,
                    totalPages: mergedTotalPages,
                    total: mergedTotal,
                    limit: SEMUA_PAGE_SIZE,
                    onPageChange: setSemuaPage,
                  }}
                  downloadFilters={{
                    dept: 'all',
                    operationalBucket,
                    regulerOnly,
                    anomalyBucket,
                    excludeSymptom: extraWorkboard?.symptom,
                  }}
                  sortField={semuaSortField as any}
                  sortOrder={semuaSortOrder}
                  onSort={handleSemuaSort}
                />
              </div>
            </div>
          )}

          {activeTab === 'unspecOhi' && extraWorkboard && (
            <div ref={extraWorkboardTableRef} className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  {extraWorkboard.title}
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {extraWorkboardPageData.pagination.total} ticket
                </span>
              </div>
              <p className='text-sm text-slate-500 dark:text-slate-400'>
                {extraWorkboard.description}
              </p>
              <TicketTable
                tickets={extraWorkboardPageData.tickets}
                tableLabel={extraWorkboard.tableLabel}
                tableSummary={extraWorkboardPageData.summary}
                loading={extraWorkboardPageData.loading}
                isRefreshing={extraWorkboardPageData.isRefreshing}
                searching={Boolean(effectiveSearchQuery)}
                onAssign={onExtraAssign}
                showBypassClose={canBypassClose}
                highlightQuery={effectiveSearchQuery}
                pagination={{
                  currentPage: extraWorkboardPageData.pagination.currentPage,
                  totalPages: extraWorkboardPageData.pagination.totalPages,
                  total: extraWorkboardPageData.pagination.total,
                  limit: extraWorkboardPageData.pagination.limit,
                  onPageChange: setExtraWorkboardPage,
                }}
                downloadFilters={{
                  dept: extraWorkboard?.dept ?? 'all',
                  operationalBucket,
                  regulerOnly,
                  anomalyBucket,
                }}
                sortField={unspecSortField as any}
                sortOrder={unspecSortOrder}
                onSort={handleUnspecSort}
              />
            </div>
          )}

          {activeTab === 'b2c' && (
            <div ref={b2cTableRef} className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  B2C Workboard
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {b2cPageData.pagination.total} ticket
                </span>
              </div>
              <FilterBarB2C
                ticketType={b2cTicketTypeFilter}
                ticketTypeOptions={b2cPageData.ticketTypeOptions}
                statusUpdate={b2cHasilVisitFilter}
                ticketStatus={b2cTicketStatusFilter}
                ticketStatusOptions={b2cPageData.statusOptions}
                flagging={b2cFlaggingFilter}
                onTypeChange={handleB2cTicketTypeChange}
                onStatusChange={handleB2cHasilVisitChange}
                onTicketStatusChange={handleB2cTicketStatusChange}
                onFlaggingChange={handleB2cFlaggingChange}
              />
              <TicketTypeBreakdownStrip
                title='Perhitungan jenis tiket B2C'
                items={b2cPageData.ticketTypeOptions}
                activeKeys={b2cTicketTypeFilter}
              />
              <TicketTableTabs
                section='b2c'
                accentColor='#10b981'
                forceMainTabKey={searchQuery.trim()}
                searching={Boolean(effectiveSearchQuery)}
                mainTable={
                  <TicketTable
                    tickets={b2cPageData.tickets}
                    tableSummary={b2cPageData.summary}
                    loading={b2cPageData.loading}
                    isRefreshing={b2cPageData.isRefreshing}
                    searching={Boolean(effectiveSearchQuery)}
                    onAssign={(ticketId) => onAssign(ticketId, 'b2c')}
                    showBypassClose={canBypassClose}
                    highlightQuery={effectiveSearchQuery}
                    pagination={{
                      currentPage: b2cPageData.pagination.currentPage,
                      totalPages: b2cPageData.pagination.totalPages,
                      total: b2cPageData.pagination.total,
                      limit: b2cPageData.pagination.limit,
                      onPageChange: setB2cPage,
                    }}
                    downloadFilters={{
                      dept: 'b2c',
                      ticketType: b2cTicketTypeFilter,
                      statusUpdate: b2cHasilVisitFilter,
                      ticketStatus: b2cTicketStatusFilter,
                      flagging: b2cFlaggingFilter,
                      operationalBucket,
                      regulerOnly,
                      anomalyBucket,
                      excludeSymptom: extraWorkboard?.symptom,
                    }}
                    sortField={b2cSortField as any}
                    sortOrder={b2cSortOrder}
                    onSort={handleB2cSort}
                  />
                }
                tickets={b2cPageData.tickets}
                validasiTickets={b2cPageData.validasiTickets}
                totalCount={b2cPageData.pagination.total}
                validasiTotalCount={b2cPageData.validasiCount}
                validasiPagination={{
                  currentPage: b2cPageData.validasiPagination.currentPage,
                  totalPages: b2cPageData.validasiPagination.totalPages,
                  total: b2cPageData.validasiPagination.total,
                  limit: b2cPageData.validasiPagination.limit,
                  onPageChange: setB2cValidasiPage,
                }}
                loading={b2cPageData.loading}
                isRefreshing={b2cPageData.isRefreshing}
                onAssign={(ticketId) => onAssign(ticketId, 'b2c')}
              />
            </div>
          )}

          {activeTab === 'b2b' && (
            <div ref={b2bTableRef} className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  B2B Workboard
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {b2bPageData.pagination.total} ticket
                </span>
              </div>
              <FilterBarB2B
                ticketType={b2bTicketTypeFilter}
                ticketTypeOptions={b2bPageData.ticketTypeOptions}
                statusUpdate={b2bHasilVisitFilter}
                ticketStatus={b2bTicketStatusFilter}
                ticketStatusOptions={b2bPageData.statusOptions}
                flagging={b2bFlaggingFilter}
                onTypeChange={handleB2bTicketTypeChange}
                onStatusChange={handleB2bHasilVisitChange}
                onTicketStatusChange={handleB2bTicketStatusChange}
                onFlaggingChange={handleB2bFlaggingChange}
              />
              <TicketTypeBreakdownStrip
                title='Perhitungan jenis tiket B2B'
                items={b2bPageData.ticketTypeOptions}
                activeKeys={b2bTicketTypeFilter}
              />
              <TicketTableTabs
                section='b2b'
                accentColor='#3b82f6'
                forceMainTabKey={searchQuery.trim()}
                searching={Boolean(effectiveSearchQuery)}
                mainTable={
                  <TicketTableB2B
                    tickets={b2bPageData.tickets}
                    tableSummary={b2bPageData.summary}
                    loading={b2bPageData.loading}
                    isRefreshing={b2bPageData.isRefreshing}
                    searching={Boolean(effectiveSearchQuery)}
                    onAssign={(ticketId) => onAssign(ticketId, 'b2b')}
                    showBypassClose={canBypassClose}
                    highlightQuery={effectiveSearchQuery}
                    pagination={{
                      currentPage: b2bPageData.pagination.currentPage,
                      totalPages: b2bPageData.pagination.totalPages,
                      total: b2bPageData.pagination.total,
                      limit: b2bPageData.pagination.limit,
                      onPageChange: setB2bPage,
                    }}
                    downloadFilters={{
                      dept: 'b2b',
                      ticketType: b2bTicketTypeFilter,
                      statusUpdate: b2bHasilVisitFilter,
                      ticketStatus: b2bTicketStatusFilter,
                      flagging: b2bFlaggingFilter,
                      operationalBucket,
                      regulerOnly,
                      anomalyBucket,
                      excludeSymptom: extraWorkboard?.symptom,
                    }}
                    sortField={b2bSortField as any}
                    sortOrder={b2bSortOrder}
                    onSort={handleB2bSort}
                  />
                }
                tickets={b2bPageData.tickets}
                validasiTickets={b2bPageData.validasiTickets}
                totalCount={b2bPageData.pagination.total}
                validasiTotalCount={b2bPageData.validasiCount}
                validasiPagination={{
                  currentPage: b2bPageData.validasiPagination.currentPage,
                  totalPages: b2bPageData.validasiPagination.totalPages,
                  total: b2bPageData.validasiPagination.total,
                  limit: b2bPageData.validasiPagination.limit,
                  onPageChange: setB2bValidasiPage,
                }}
                loading={b2bPageData.loading}
                isRefreshing={b2bPageData.isRefreshing}
                onAssign={(ticketId) => onAssign(ticketId, 'b2b')}
              />
            </div>
          )}

          {activeTab === 'validasi' && (
            <div ref={validasiTableRef} className='space-y-5'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  Validasi Tickets
                </h2>
                <div className='flex items-center gap-2'>
                  <select
                    value={validasiDownloadFormat}
                    onChange={(e) =>
                      setValidasiDownloadFormat(e.target.value as 'csv' | 'xlsx')
                    }
                    className='bg-surface rounded border border-(--border) px-1.5 py-1 text-xs text-(--text-secondary)'
                  >
                    <option value='xlsx'>XLSX</option>
                    <option value='csv'>CSV</option>
                  </select>
                  <button
                    onClick={handleValidasiDownload}
                    disabled={validasiDownloading}
                    className='flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60'
                  >
                    {validasiDownloading ? (
                      <Loader2 size={14} className='animate-spin' />
                    ) : (
                      <Download size={14} />
                    )}
                    Download
                  </button>
                </div>
              </div>
              <div className='space-y-2'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  Validasi B2C
                </h2>
                <TicketTableValidasi
                  tickets={b2cPageData.validasiTickets}
                  searching={Boolean(effectiveSearchQuery)}
                  pagination={{
                    currentPage: b2cPageData.validasiPagination.currentPage,
                    totalPages: b2cPageData.validasiPagination.totalPages,
                    total: b2cPageData.validasiPagination.total,
                    limit: b2cPageData.validasiPagination.limit,
                    onPageChange: setB2cValidasiPage,
                  }}
                  loading={b2cPageData.loading}
                  isRefreshing={b2cPageData.isRefreshing}
                  highlightQuery={effectiveSearchQuery}
                />
              </div>
              <div className='space-y-2'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  Validasi B2B
                </h2>
                <TicketTableValidasi
                  tickets={b2bPageData.validasiTickets}
                  searching={Boolean(effectiveSearchQuery)}
                  pagination={{
                    currentPage: b2bPageData.validasiPagination.currentPage,
                    totalPages: b2bPageData.validasiPagination.totalPages,
                    total: b2bPageData.validasiPagination.total,
                    limit: b2bPageData.validasiPagination.limit,
                    onPageChange: setB2bValidasiPage,
                  }}
                  loading={b2bPageData.loading}
                  isRefreshing={b2bPageData.isRefreshing}
                  highlightQuery={effectiveSearchQuery}
                />
              </div>
            </div>
          )}

          {activeTab === 'close' && (
            <div ref={closeTableRef} className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  Close Tickets
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {closePageData.pagination.total} ticket
                </span>
              </div>
              <TicketTable
                tickets={closePageData.tickets}
                tableSummary={closePageData.summary}
                loading={closePageData.loading}
                isRefreshing={closePageData.isRefreshing}
                searching={Boolean(effectiveSearchQuery)}
                onAssign={onCombinedAssign}
                showBypassClose={canBypassClose}
                highlightQuery={effectiveSearchQuery}
                pagination={{
                  currentPage: closePageData.pagination.currentPage,
                  totalPages: closePageData.pagination.totalPages,
                  total: closePageData.pagination.total,
                  limit: closePageData.pagination.limit,
                  onPageChange: setClosePage,
                }}
                downloadFilters={{
                  dept: 'all',
                  operationalBucket,
                  regulerOnly,
                  anomalyBucket,
                  excludeSymptom: extraWorkboard?.symptom,
                  ticketStatus: CLOSE_STATUS_VALUES,
                }}
                sortField={closeSortField as any}
                sortOrder={closeSortOrder}
                onSort={handleCloseSort}
              />
            </div>
          )}

          {activeTab === 'gamas' && (
            <div ref={gamasTableRef} className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>
                  GAMAS Tickets
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {gamasPageData.pagination.total} ticket
                </span>
              </div>
              <TicketTable
                tickets={gamasPageData.tickets}
                tableSummary={gamasPageData.summary}
                loading={gamasPageData.loading}
                isRefreshing={gamasPageData.isRefreshing}
                searching={Boolean(effectiveSearchQuery)}
                onAssign={onCombinedAssign}
                showBypassClose={canBypassClose}
                highlightQuery={effectiveSearchQuery}
                pagination={{
                  currentPage: gamasPageData.pagination.currentPage,
                  totalPages: gamasPageData.pagination.totalPages,
                  total: gamasPageData.pagination.total,
                  limit: gamasPageData.pagination.limit,
                  onPageChange: setGamasPage,
                }}
                downloadFilters={{
                  dept: 'all',
                  operationalBucket,
                  regulerOnly,
                  anomalyBucket,
                  gamasOnly: true,
                }}
                sortField={gamasSortField as any}
                sortOrder={gamasSortOrder}
                onSort={handleGamasSort}
              />
            </div>
          )}
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
