'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import AdminLayout from '@/app/components/layout/AdminLayout';
import NewTicketModal from '@/app/admin/components/dashboard/create/NewTicketModal';
import AssignTechnicianModal from '@/app/admin/components/dashboard/assign/AssignTechnicianModal';
import { useDailyTickets } from '@/app/hooks/useDailyTickets';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { useOperationsSummary } from '@/app/hooks/useOperationsSummary';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { useExpiredTickets } from '@/app/hooks/useExpiredTickets';
import { useOpenDiamondTickets } from '@/app/hooks/useOpenDiamondTickets';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import { TicketCtype, Ticket } from '@/app/types/ticket';
import {
  normalizeJenis,
  isB2CJenis,
  isB2BJenis,
} from '@/app/config/jenis-tiket';
import { getB2BGroupKey } from '@/app/config/b2b-groups';
import {
  countStatusBuckets,
  isTicketClosed,
  isTicketInWork,
  isTicketOpenLike,
  normalizeStatusUpdate,
} from '@/app/libs/ticket-utils';

import StatCard from './components/dashboard/StatCard';
import { DiamondAlertBanner } from './components/dashboard/AlertBanner';
import { FilterBarB2C } from './components/dashboard/filterbarb2c';
import { FilterBarB2B } from './components/dashboard/filterbarb2b';
import B2BSection from './components/dashboard/B2BSection';
import B2CSection from './components/dashboard/B2CSection';
import ServiceAreaTable from './components/dashboard/ServiceAreaTable';
import TicketTable from './components/dashboard/TicketTable';
import TicketTableB2B from './components/dashboard/TicketTableB2B';
import TicketTableTabs from './components/dashboard/TicketTableTabs';
import OperationalFocusQueue, {
  buildOperationalFocusItems,
} from './components/dashboard/OperationalFocusQueue';
import AdminAccordion from '@/app/components/ui/AdminAccordion';
import { useSyncStatus } from '@/app/hooks/useSyncStatus';
import { RefreshCw } from 'lucide-react';
import SearchToast from './components/dashboard/SearchToast';

interface TicketData {
  idTicket: number;
  ticketCode?: string;
  workzone?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number;
}

interface CtypeCounts {
  all: number;
  REGULER: number;
  HVC_GOLD: number;
  HVC_PLATINUM: number;
  HVC_DIAMOND: number;
}

interface JenisCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
  gamasCount: number;
  ffgCount: number;
  p1Count: number;
  pPlusCount: number;
  regulerCount: number;
  sqmCount: number;
}

interface B2BData {
  sqmCcan: JenisCounts;
  indibiz: JenisCounts;
  datin: JenisCounts;
  reseller: JenisCounts;
  wifiId: JenisCounts;
  unknown: JenisCounts;
  digitalSpbu: JenisCounts;
  permintaan: JenisCounts;
  unspecB2b: JenisCounts;
  nonNumbering: JenisCounts;
  astinet: JenisCounts;
  tsel: JenisCounts;
  vpnIp: JenisCounts;
  metroE: JenisCounts;
  dwdm: JenisCounts;
  summary: JenisCounts;
}

function hasValidTicketIdGamas(ticket: Ticket): string | null {
  const candidates = [
    ticket.ticketIdGamas,
    (ticket as any).ticketIdGamas,
    (ticket as any).ticket_id_gamas,
    (ticket as any).TICKET_ID_GAMAS,
  ];
  const raw = candidates.find((v) => v !== null && v !== undefined);
  const normalized = String(raw ?? '').trim();
  if (
    !normalized ||
    ['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
      normalized.toLowerCase(),
    )
  ) {
    return null;
  }
  return normalized;
}

function mapTicketForTable(t: Ticket) {
  return {
    idTicket: t.idTicket,
    ticket: t.ticket,
    serviceNo: t.serviceNo,
    ticketIdGamas: hasValidTicketIdGamas(t),
    contactName: t.contactName,
    contactPhone: t.contactPhone,
    alamat: t.alamat,
    bookingDate: t.bookingDate,
    ctype: t.ctype,
    customerType: t.customerType,
    summary: t.summary,
    jenisTiket: t.jenisTiket,
    jenisTiket1: t.jenisTiket1,
    workzone: t.workzone,
    technicianName: t.technicianName,
    teknisiUserId: t.teknisiUserId,
    status_update: normalizeStatusUpdate(t.status_update),
    closedAt: t.closedAt,
    reportedDate: t.reportedDate,
    status: t.status,
    maxTtrReguler: t.maxTtrReguler,
    maxTtrGold: t.maxTtrGold,
    maxTtrPlatinum: t.maxTtrPlatinum,
    maxTtrDiamond: t.maxTtrDiamond,
    flaggingManja: t.flaggingManja,
    guaranteeStatus: t.guaranteeStatus,
    pendingDompis: t.pendingDompis,
  };
}

export default function TicketPage() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ctypeFilter, setCtypeFilter] = useState<TicketCtype | 'all'>('all');
  const [ctypeCounts, setCtypeCounts] = useState<CtypeCounts>({
    all: 0,
    REGULER: 0,
    HVC_GOLD: 0,
    HVC_PLATINUM: 0,
    HVC_DIAMOND: 0,
  });
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );
  const [deptFilter, setDeptFilter] = useState<'all' | 'b2b' | 'b2c'>('all');

  // Search toast state
  const [searchToast, setSearchToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Auto-scroll refs
  const b2cSectionRef = useRef<HTMLDivElement>(null);
  const b2bSectionRef = useRef<HTMLDivElement>(null);

  const pendingRefreshRef = useRef(false);

  // B2C filter state (multi-select)
  const [b2cTicketTypeFilter, setB2cTicketTypeFilter] = useState<string[]>([]);
  const [b2cHasilVisitFilter, setB2cHasilVisitFilter] = useState<string[]>([]);
  const [b2cFlaggingFilter, setB2cFlaggingFilter] = useState<string[]>([]);

  // B2B filter state (multi-select)
  const [b2bTicketTypeFilter, setB2bTicketTypeFilter] = useState<string[]>([]);
  const [b2bHasilVisitFilter, setB2bHasilVisitFilter] = useState<string[]>([]);
  const [b2bFlaggingFilter, setB2bFlaggingFilter] = useState<string[]>([]);

  // Separate pagination state for B2C and B2B tables
  const [b2cPage, setB2cPage] = useState(1);
  const [b2bPage, setB2bPage] = useState(1);

  // Read dept from URL query param
  useEffect(() => {
    const dept = searchParams.get('dept');
    if (dept === 'b2b' || dept === 'b2c') {
      setDeptFilter(dept);
    } else {
      setDeptFilter('all');
    }
  }, [searchParams]);

  const { options: workzoneOptions, loading: workzoneLoading } =
    useWorkzoneOptions();

  const {
    lastSyncLabel,
    nextSyncLabel,
    isSyncOverdue,
    isInProgress,
    syncError,
    triggerSync,
  } = useSyncStatus();

  const { tickets: expiredTickets, isRefreshing: isExpiredRefreshing, refresh: refreshExpired, refreshSilent: refreshExpiredSilent } =
    useExpiredTickets(workzoneFilter || undefined, {
      dept: deptFilter,
      ticketType: 'all',
      statusUpdate: 'all',
    });

  const { tickets: diamondTickets, refresh: refreshDiamond } =
    useOpenDiamondTickets(workzoneFilter || undefined, {
      dept: deptFilter,
      ticketType: 'all',
    });

  // Use Daily Tickets for the operational working board
  const { tickets, loading, isRefreshing, pagination, refresh, refreshSilent } = useDailyTickets(
    searchQuery,
    1,
    workzoneFilter || undefined,
    undefined, // ctype: filter di client-side (tidak perlu fetch ulang)
    undefined, // hasilVisitFilter - now handled per section
    deptFilter !== 'all' ? deptFilter : undefined,
    undefined, // ticketTypeFilter - now handled per section
    { fetchAll: true },
  );

  const b2bPageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketType: b2bTicketTypeFilter,
    statusUpdate: b2bHasilVisitFilter,
    flagging: b2bFlaggingFilter,
    page: b2bPage,
    limit: 10,
  });

  const b2cPageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2c',
    ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
    ticketType: b2cTicketTypeFilter,
    statusUpdate: b2cHasilVisitFilter,
    flagging: b2cFlaggingFilter,
    page: b2cPage,
    limit: 10,
  });

  const refreshB2bPageSilent = b2bPageData.refreshSilent;
  const refreshB2cPageSilent = b2cPageData.refreshSilent;

  const {
    data: operationsSummary,
    refetch: refetchOperationsSummary,
  } = useOperationsSummary({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: deptFilter,
  });

  // SSE-based real-time updates (primary mechanism)
  const [syncStatus, setSyncStatus] = useState<{
    inProgress: boolean;
    lastResult?: string;
  }>({ inProgress: false });

  useTicketEvents({
    onInvalidate: useCallback(() => {
      if (showNewTicketModal || assignModalTicket) {
        pendingRefreshRef.current = true;
        return;
      }
      refreshSilent();
      refreshExpiredSilent();
      refreshDiamond();
      refetchOperationsSummary();
      refreshB2bPageSilent();
      refreshB2cPageSilent();
    }, [showNewTicketModal, assignModalTicket, refreshSilent, refreshExpiredSilent, refreshDiamond, refetchOperationsSummary, refreshB2bPageSilent, refreshB2cPageSilent]),
    onSyncStart: useCallback(() => {
      setSyncStatus({ inProgress: true });
    }, []),
    onSyncComplete: useCallback(
      (data: { inserted?: number; updated?: number }) => {
        setSyncStatus({
          inProgress: false,
          lastResult: `+${data.inserted || 0} ~${data.updated || 0}`,
        });
        setTimeout(
          () => setSyncStatus((s) => ({ ...s, lastResult: undefined })),
          5000,
        );
      },
      [],
    ),
    onSyncError: useCallback((error: string) => {
      setSyncStatus({ inProgress: false, lastResult: `Error: ${error}` });
    }, []),
    enabled: true,
    debounceMs: 300,
  });

  // Smart visibility revalidation — refresh once when tab becomes visible after > 5 min idle
  const lastActiveRef = useRef<number>(Date.now());
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const idleMs = Date.now() - lastActiveRef.current;
        if (idleMs > STALE_THRESHOLD_MS) {
          refreshSilent();
          refreshExpiredSilent();
          refetchOperationsSummary();
          refreshB2bPageSilent();
          refreshB2cPageSilent();
        }
      } else {
        lastActiveRef.current = Date.now();
      }
    };

    const handleOnline = () => {
      refreshSilent();
      refreshExpiredSilent();
      refetchOperationsSummary();
      refreshB2bPageSilent();
      refreshB2cPageSilent();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshSilent, refreshExpiredSilent, refetchOperationsSummary]);

  // ═══════════════════════════════════════════════════════════════════════
  // SEARCH TOAST + AUTO-SCROLL — uses b2cTicketTableData / b2bTicketTableData
  // ═══════════════════════════════════════════════════════════════════════
  // Search toast + auto-scroll (depends on b2cTicketTableData and b2bTicketTableData)

  // Filter B2C/B2B tickets from daily dataset - USE jenis_tiket_2 (same as backend)
  const isB2CCustomerType = (t: Ticket) => {
    return isB2CJenis(t.jenisTiket);
  };

  const isB2BCustomerType = (t: Ticket) => {
    return isB2BJenis(t.jenisTiket);
  };

  const b2cDailyTickets = useMemo(
    () => tickets.filter(isB2CCustomerType),
    [tickets],
  );

  // Compute summary from B2C daily tickets
  const b2cDailySummary = useMemo(() => {
    const summary: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      gamasCount: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      p1Count: number;
      pPlusCount: number;
    } = {
      total: b2cDailyTickets.length,
      open: 0,
      assigned: 0,
      close: 0,
      gamasCount: 0,
      customerCount: 0,
      sqmCount: 0,
      unspecCount: 0,
      ffgCount: 0,
      p1Count: 0,
      pPlusCount: 0,
    };

    for (const t of b2cDailyTickets) {
      const isClose = isTicketClosed(t.status_update);
      const isAssigned = isTicketInWork(t.status_update);
      const jenisType = normalizeJenis(t.jenisTiket);

      // Status counts
      if (isClose) {
        summary.close++;
      } else if (isAssigned) {
        summary.assigned++;
      } else {
        summary.open++;
      }

      // Jenis breakdown (customer = reguler + hvc, sqm, unspec)
      if (jenisType === 'reguler' || jenisType === 'hvc')
        summary.customerCount++;
      else if (jenisType === 'sqm') summary.sqmCount++;
      else summary.unspecCount++;

      // Flagging counts
      {
        const candidates = [
          t.ticketIdGamas,
          (t as any).ticket_id_gamas,
          (t as any).TICKET_ID_GAMAS,
        ];
        const raw = candidates.find((v) => v !== null && v !== undefined);
        const normalized = String(raw ?? '').trim();
        if (
          normalized &&
          !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
            normalized.toLowerCase(),
          )
        ) {
          summary.gamasCount++;
        }
      }

      if (t.guaranteeStatus?.toLowerCase() === 'guarantee') summary.ffgCount++;
      if (t.flaggingManja === 'P1') summary.p1Count++;
      if (t.flaggingManja === 'P+') summary.pPlusCount++;
    }

    return summary;
  }, [b2cDailyTickets]);

  // Customer type breakdown from daily B2C tickets
  const b2cDailyByType = useMemo(() => {
    const typeMap = new Map<
      string,
      {
        total: number;
        open: number;
        assigned: number;
        close: number;
        gamasCount: number;
        customerCount: number;
        sqmCount: number;
        unspecCount: number;
        ffgCount: number;
        p1Count: number;
        pPlusCount: number;
      }
    >();

    const initType = () =>
      ({
        total: 0,
        open: 0,
        assigned: 0,
        close: 0,
        gamasCount: 0,
        customerCount: 0,
        sqmCount: 0,
        unspecCount: 0,
        ffgCount: 0,
        p1Count: 0,
        pPlusCount: 0,
      }) as {
        total: number;
        open: number;
        assigned: number;
        close: number;
        gamasCount: number;
        customerCount: number;
        sqmCount: number;
        unspecCount: number;
        ffgCount: number;
        p1Count: number;
        pPlusCount: number;
      };

    const KNOWN_CTYPES = new Set([
      'REGULER',
      'HVC_GOLD',
      'HVC_PLATINUM',
      'HVC_DIAMOND',
    ]);

    for (const t of b2cDailyTickets) {
      const rawCtype = (t.ctype || t.customerType || '') as string;
      const normalized = rawCtype.trim().toLowerCase();
      const rawType =
        (['reguler', 'hvc_gold', 'hvc_platinum', 'hvc_diamond'].includes(
          normalized,
        )
          ? normalized.toUpperCase().replace(/_/g, '_')
          : '') || 'UNCLASSIFIED';
      const type = KNOWN_CTYPES.has(rawType) ? rawType : 'UNCLASSIFIED';

      if (!typeMap.has(type)) typeMap.set(type, initType());

      const data = typeMap.get(type)!;
      data.total++;

      const isClose = isTicketClosed(t.status_update);
      const isAssigned = isTicketInWork(t.status_update);
      const jenisType = normalizeJenis(t.jenisTiket);

      if (isClose) data.close++;
      else if (isAssigned) data.assigned++;
      else data.open++;

      if (jenisType === 'reguler' || jenisType === 'hvc') data.customerCount++;
      else if (jenisType === 'sqm') data.sqmCount++;
      else data.unspecCount++;

      {
        const candidates = [
          t.ticketIdGamas,
          (t as any).ticket_id_gamas,
          (t as any).TICKET_ID_GAMAS,
        ];
        const raw = candidates.find((v) => v !== null && v !== undefined);
        const normalized = String(raw ?? '').trim();
        if (
          normalized &&
          !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
            normalized.toLowerCase(),
          )
        ) {
          data.gamasCount++;
        }
      }

      if (t.guaranteeStatus?.toLowerCase() === 'guarantee') data.ffgCount++;
      if (t.flaggingManja === 'P1') data.p1Count++;
      if (t.flaggingManja === 'P+') data.pPlusCount++;
    }

    return typeMap;
  }, [b2cDailyTickets]);

  const inferDept = useCallback((t: Ticket) => {
    const seg = (t.customerSegment ?? '').toUpperCase();
    if (seg === 'B2B') return 'b2b' as const;
    if (seg === 'B2C' || seg === 'PL_TSEL') return 'b2c' as const;

    const ct = (t.customerType ?? '').toLowerCase();
    if (!ct) return null;

    if (['reguler', 'hvc_gold', 'hvc_platinum', 'hvc_diamond'].includes(ct)) {
      return 'b2c' as const;
    }

    if (
      ct.startsWith('datin_') ||
      ct.startsWith('indibiz') ||
      ct.startsWith('reseller') ||
      ct.startsWith('wifi')
    ) {
      return 'b2b' as const;
    }

    return null;
  }, []);

  const normalizeCustomerType = useCallback((t: Ticket) => {
    const raw = (t.customerType || t.ctype || '').toString();
    return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/__+/g, '_');
  }, []);

  const normalizeVisitStatus = useCallback((t: Ticket) => {
    const raw = (
      (t.status_update ?? t.hasilVisit ?? t.status) ||
      ''
    ).toString();
    return raw.trim().toUpperCase().replace(/\s+/g, '_');
  }, []);

  const normalizeTicketType = useCallback((t: Ticket) => {
    return normalizeJenis(t.jenisTiket);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // STATS — computed from daily tickets (NOT separate API call)
  // This ensures StatCards are ALWAYS in sync with the table
  // ═══════════════════════════════════════════════════════════════════════

  const clientStats = useMemo(() => {
    const b2cTickets = tickets.filter(isB2CCustomerType);
    const b2bTickets = tickets.filter(isB2BCustomerType);

    const statusCounts = countStatusBuckets(tickets, (t) => t.status_update);
    const total = statusCounts.total;
    const unassigned = statusCounts.open;
    const assigned =
      statusCounts.assigned + statusCounts.onProgress + statusCounts.pending;
    const close = statusCounts.close;

    const b2c = b2cTickets.length;
    const b2b = b2bTickets.length;

    return { total, unassigned, assigned, close, b2c, b2b };
  }, [tickets]);

  const stats = operationsSummary?.stats ?? clientStats;

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setB2cPage(1);
    setB2bPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setB2cPage(1);
    setB2bPage(1);
  }, []);

  const handleCtypeChange = useCallback((ctype: TicketCtype | 'all') => {
    setCtypeFilter(ctype);
    setB2cPage(1);
    setB2bPage(1);
  }, []);

  const handleB2cCustomerTypeSelect = useCallback(
    (ctype: TicketCtype | 'all') => {
      // Ensure the table view matches the B2C card selection.
      setDeptFilter('b2c');
      setCtypeFilter(ctype);
      setB2cPage(1);
      setB2bPage(1);
    },
    [],
  );

  const handleClearCtypeFilter = useCallback(() => {
    setCtypeFilter('all');
    setB2cPage(1);
    setB2bPage(1);
  }, []);

  const handleCtypeCountsChange = useCallback(
    (counts: Record<string, number>) => {
      setCtypeCounts({
        all: counts.all || 0,
        REGULER: counts.REGULER || 0,
        HVC_GOLD: counts.HVC_GOLD || 0,
        HVC_PLATINUM: counts.HVC_PLATINUM || 0,
        HVC_DIAMOND: counts.HVC_DIAMOND || 0,
      });
    },
    [],
  );

  const handleAssignClick = (ticketId: number | string) => {
    const ticket = [
      ...b2bPageData.tickets,
      ...b2cPageData.tickets,
      ...tickets,
    ].find((t) => String(t.idTicket) === String(ticketId));
    const techId = ticket?.teknisiUserId;
    setAssignModalTicket({
      idTicket: Number(ticketId),
      ticketCode: ticket?.ticket,
      workzone: ticket?.workzone ?? null,
      technicianName: ticket?.technicianName ?? null,
      teknisiUserId:
        techId !== undefined && techId !== null ? techId : undefined,
    });
  };

  const handleDeptChange = (dept: 'all' | 'b2b' | 'b2c') => {
    setDeptFilter(dept);
  };

  const handleB2cTicketTypeChange = (types: string[]) => {
    setB2cTicketTypeFilter(types);
    setB2cPage(1);
  };

  const handleB2cHasilVisitChange = (statuses: string[]) => {
    setB2cHasilVisitFilter(statuses);
    setB2cPage(1);
  };

  const handleB2cFlaggingChange = (flags: string[]) => {
    setB2cFlaggingFilter(flags);
    setB2cPage(1);
  };

  const handleB2bTicketTypeChange = (types: string[]) => {
    setB2bTicketTypeFilter(types);
    setB2bPage(1);
  };

  const handleB2bHasilVisitChange = (statuses: string[]) => {
    setB2bHasilVisitFilter(statuses);
    setB2bPage(1);
  };

  const handleB2bFlaggingChange = (flags: string[]) => {
    setB2bFlaggingFilter(flags);
    setB2bPage(1);
  };

  // IMPORTANT: Admin ticket table pagination happens on the client.
  // Keep this list as the full dataset for sorting + pagination in TicketTable.
  const filteredTickets = tickets;

  // expiredTickets comes from /api/tickets/expired (not paginated)

  const getCounts = (arr: Ticket[]) => ({
    total: arr.length,
    open: arr.filter((t) => {
      return isTicketOpenLike(t.status_update);
    }).length,
    assigned: arr.filter((t) => {
      return isTicketInWork(t.status_update);
    }).length,
    close: arr.filter((t) => {
      return isTicketClosed(t.status_update);
    }).length,
    regulerCount: arr.filter((t) => {
      const jt = normalizeTicketType(t);
      return jt === 'reguler';
    }).length,
    sqmCount: arr.filter((t) => {
      const jt = normalizeTicketType(t);
      // ← CHANGED: normalizeJenis correctly handles sqm vs sqm-ccan separation
      // 'sqm-ccan' maps to 'sqm-ccan', NOT 'sqm', so no false positives
      return jt === 'sqm';
    }).length,
    ffgCount: arr.filter(
      (t) => t.guaranteeStatus?.toLowerCase() === 'guarantee',
    ).length,

    gamasCount: arr.filter((t) => {
      const candidates = [
        t.ticketIdGamas,
        (t as any).ticket_id_gamas,
        (t as any).TICKET_ID_GAMAS,
      ];
      const raw = candidates.find((v) => v !== null && v !== undefined);
      const normalized = String(raw ?? '').trim();
      if (!normalized) return false;
      return !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
        normalized.toLowerCase(),
      );
    }).length,

    p1Count: arr.filter((t) => t.flaggingManja === 'P1').length,
    pPlusCount: arr.filter((t) => t.flaggingManja === 'P+').length,
  });

  // ← CHANGED: b2bStats now uses jenis-based filtering with countJenis helper
  function countJenis(tickets: Ticket[], jenisKey: string) {
    const arr = tickets.filter(
      (t) => normalizeJenis(t.jenisTiket) === jenisKey,
    );
    return getCounts(arr);
  }

  const sqmCcan = countJenis(filteredTickets, 'sqm-ccan');
  const indibiz = countJenis(filteredTickets, 'indibiz');
  const datin = countJenis(filteredTickets, 'datin');
  const reseller = countJenis(filteredTickets, 'reseller');
  const wifiId = countJenis(filteredTickets, 'wifi-id');
  const unknown = countJenis(filteredTickets, 'unknown');
  const digitalSpbu = countJenis(filteredTickets, 'digital-spbu');
  const permintaan = countJenis(filteredTickets, 'permintaan');
  const unspecB2b = countJenis(filteredTickets, 'unspec-b2b');
  const nonNumbering = countJenis(filteredTickets, 'non-numbering');
  const astinet = countJenis(filteredTickets, 'astinet');
  const tsel = countJenis(filteredTickets, 'tsel');
  const vpnIp = countJenis(filteredTickets, 'vpn-ip');
  const metroE = countJenis(filteredTickets, 'metro-e');
  const dwdm = countJenis(filteredTickets, 'dwdm');

  const b2bStats: B2BData = {
    sqmCcan,
    indibiz,
    datin,
    reseller,
    wifiId,
    unknown,
    digitalSpbu,
    permintaan,
    unspecB2b,
    nonNumbering,
    astinet,
    tsel,
    vpnIp,
    metroE,
    dwdm,
    summary: {
      total:
        sqmCcan.total +
        indibiz.total +
        datin.total +
        reseller.total +
        wifiId.total +
        unknown.total +
        digitalSpbu.total +
        permintaan.total +
        unspecB2b.total +
        nonNumbering.total +
        astinet.total +
        tsel.total +
        vpnIp.total +
        metroE.total +
        dwdm.total,
      open:
        sqmCcan.open + indibiz.open + datin.open + reseller.open + wifiId.open +
        unknown.open + digitalSpbu.open + permintaan.open + unspecB2b.open +
        nonNumbering.open + astinet.open + tsel.open + vpnIp.open + metroE.open +
        dwdm.open,
      assigned:
        sqmCcan.assigned + indibiz.assigned + datin.assigned + reseller.assigned +
        wifiId.assigned + unknown.assigned + digitalSpbu.assigned + permintaan.assigned +
        unspecB2b.assigned + nonNumbering.assigned + astinet.assigned + tsel.assigned +
        vpnIp.assigned + metroE.assigned + dwdm.assigned,
      close:
        sqmCcan.close + indibiz.close + datin.close + reseller.close + wifiId.close +
        unknown.close + digitalSpbu.close + permintaan.close + unspecB2b.close +
        nonNumbering.close + astinet.close + tsel.close + vpnIp.close + metroE.close +
        dwdm.close,
      ffgCount:
        sqmCcan.ffgCount + indibiz.ffgCount + datin.ffgCount + reseller.ffgCount +
        wifiId.ffgCount + unknown.ffgCount + digitalSpbu.ffgCount + permintaan.ffgCount +
        unspecB2b.ffgCount + nonNumbering.ffgCount + astinet.ffgCount + tsel.ffgCount +
        vpnIp.ffgCount + metroE.ffgCount + dwdm.ffgCount,
      gamasCount:
        sqmCcan.gamasCount + indibiz.gamasCount + datin.gamasCount + reseller.gamasCount +
        wifiId.gamasCount + unknown.gamasCount + digitalSpbu.gamasCount + permintaan.gamasCount +
        unspecB2b.gamasCount + nonNumbering.gamasCount + astinet.gamasCount + tsel.gamasCount +
        vpnIp.gamasCount + metroE.gamasCount + dwdm.gamasCount,
      p1Count:
        sqmCcan.p1Count + indibiz.p1Count + datin.p1Count + reseller.p1Count +
        wifiId.p1Count + unknown.p1Count + digitalSpbu.p1Count + permintaan.p1Count +
        unspecB2b.p1Count + nonNumbering.p1Count + astinet.p1Count + tsel.p1Count +
        vpnIp.p1Count + metroE.p1Count + dwdm.p1Count,
      pPlusCount:
        sqmCcan.pPlusCount + indibiz.pPlusCount + datin.pPlusCount + reseller.pPlusCount +
        wifiId.pPlusCount + unknown.pPlusCount + digitalSpbu.pPlusCount + permintaan.pPlusCount +
        unspecB2b.pPlusCount + nonNumbering.pPlusCount + astinet.pPlusCount + tsel.pPlusCount +
        vpnIp.pPlusCount + metroE.pPlusCount + dwdm.pPlusCount,
      regulerCount:
        sqmCcan.regulerCount + indibiz.regulerCount + datin.regulerCount + reseller.regulerCount +
        wifiId.regulerCount + unknown.regulerCount + digitalSpbu.regulerCount + permintaan.regulerCount +
        unspecB2b.regulerCount + nonNumbering.regulerCount + astinet.regulerCount + tsel.regulerCount +
        vpnIp.regulerCount + metroE.regulerCount + dwdm.regulerCount,
      sqmCount:
        sqmCcan.sqmCount + indibiz.sqmCount + datin.sqmCount + reseller.sqmCount +
        wifiId.sqmCount + unknown.sqmCount + digitalSpbu.sqmCount + permintaan.sqmCount +
        unspecB2b.sqmCount + nonNumbering.sqmCount + astinet.sqmCount + tsel.sqmCount +
        vpnIp.sqmCount + metroE.sqmCount + dwdm.sqmCount,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // B2B GROUPED DATA — grouped by jenis_tiket_1 (parent)
  // ═══════════════════════════════════════════════════════════════════════
  const b2bGroupedData = useMemo(() => {
    const b2bTickets = filteredTickets.filter(isB2BCustomerType);
    const groupMap = new Map<string, Ticket[]>();

    for (const ticket of b2bTickets) {
      const groupKey = getB2BGroupKey(ticket.jenisTiket1);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(ticket);
    }

    return Array.from(groupMap.entries()).map(([groupKey, tickets]) => ({
      groupKey,
      tickets,
    }));
  }, [filteredTickets]);

  const clientB2bSummary = useMemo(() => {
    const arr = filteredTickets.filter(isB2BCustomerType);
    return {
      total: arr.length,
      open: arr.filter((t) => isTicketOpenLike(t.status_update)).length,
      assigned: arr.filter((t) => isTicketInWork(t.status_update)).length,
      close: arr.filter((t) => isTicketClosed(t.status_update)).length,
      regulerCount: 0,
      sqmCount: 0,
      ffgCount: arr.filter((t) => t.flaggingManja === 'FFG').length,
      gamasCount: arr.filter((t) => t.ticketIdGamas).length,
      p1Count: arr.filter((t) => t.flaggingManja === 'P1').length,
      pPlusCount: arr.filter((t) => t.flaggingManja === 'P+').length,
    };
  }, [filteredTickets]);

  const b2bSummary = operationsSummary?.b2bSummary ?? clientB2bSummary;

  // Section summaries: use backend pagination total to match table count
  const b2bSectionSummary = useMemo(() => {
    const breakdown = clientB2bSummary;
    return {
      ...breakdown,
      total: b2bPageData.pagination.total,
    };
  }, [clientB2bSummary, b2bPageData.pagination.total]);

  // ═══════════════════════════════════════════════════════════════════════
  // B2C STATS — NOW USING DAILY OPERATIONAL SCOPE (aligned with table)
  // ═══════════════════════════════════════════════════════════════════════
  const clientB2cStats = useMemo(() => {
    const getTypeData = (type: string) => {
      const data = b2cDailyByType.get(type);
      return (
        data || {
          total: 0,
          open: 0,
          assigned: 0,
          close: 0,
          customerCount: 0,
          sqmCount: 0,
          unspecCount: 0,
          ffgCount: 0,
          gamasCount: 0,
          p1Count: 0,
          pPlusCount: 0,
        }
      );
    };

    const reguler = getTypeData('REGULER');
    const hvcGold = getTypeData('HVC_GOLD');
    const hvcPlatinum = getTypeData('HVC_PLATINUM');
    const hvcDiamond = getTypeData('HVC_DIAMOND');

    return {
      summary: b2cDailySummary,
      reguler,
      hvcGold,
      hvcPlatinum,
      hvcDiamond,
    };
  }, [b2cDailySummary, b2cDailyByType]);

  const b2cStats = operationsSummary?.b2cStats ?? clientB2cStats;

  // Section summaries: use b2cStats summary (backend when available, client fallback)
  // with total from backend pagination to match table count
  const b2cSectionSummary = useMemo(() => {
    const breakdown = b2cStats.summary;
    return {
      ...breakdown,
      total: b2cPageData.pagination.total,
    };
  }, [b2cStats.summary, b2cPageData.pagination.total]);

  const b2cTypeCounts = useMemo(() => {
    const b2cTickets = tickets.filter(isB2CCustomerType);
    const typeMap = new Map<string, number>();

    for (const t of b2cTickets) {
      const type = (t.ctype || t.customerType || 'Unspec').toUpperCase();
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    }

    const totalB2c = b2cTickets.length;

    return {
      all: totalB2c,
      REGULER: typeMap.get('REGULER') || 0,
      HVC_GOLD: typeMap.get('HVC_GOLD') || 0,
      HVC_PLATINUM: typeMap.get('HVC_PLATINUM') || 0,
      HVC_DIAMOND: typeMap.get('HVC_DIAMOND') || 0,
    };
  }, [tickets]);

  // ═══════════════════════════════════════════════════════════════════════
  // SERVICE AREAS — computed from daily tickets per workzone
  // ═══════════════════════════════════════════════════════════════════════

  const clientServiceAreas = useMemo(() => {
    const workzoneMap = new Map<string, typeof tickets>();

    for (const t of tickets) {
      const wz = (t.workzone ?? '').trim();
      if (!wz) continue;
      if (!workzoneMap.has(wz)) workzoneMap.set(wz, []);
      workzoneMap.get(wz)!.push(t);
    }

    const rows = Array.from(workzoneMap.entries()).map(([name, arr]) => ({
      name,
      total: arr.length,
      unassigned: arr.filter((t) => {
        return isTicketOpenLike(t.status_update);
      }).length,
      open: arr.filter(
        (t) => isTicketOpenLike(t.status_update),
      ).length,
      assigned: arr.filter((t) => {
        return isTicketInWork(t.status_update);
      }).length,
      close: arr.filter((t) => {
        return isTicketClosed(t.status_update);
      }).length,
    }));

    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, 5);
  }, [tickets]);

  const serviceAreas = operationsSummary?.serviceAreas ?? clientServiceAreas;

  const isValidationTicket = (t: Ticket) => {
    const statusUpdate = (t.status_update ?? '').trim().toLowerCase();
    const status = (t.status ?? '').trim().toLowerCase();
    return statusUpdate === 'close' && status !== 'closed';
  };

  // Reusable client-side filter function (matches the filter logic used for main table)
  const applyClientFilters = <T extends {
    ctype?: string | null;
    customerType?: string | null;
    jenisTiket?: string | null;
    status_update?: string | null;
    guaranteeStatus?: string | null;
    ticketIdGamas?: string | null;
    flaggingManja?: string | null;
  }>(
    arr: T[],
    ticketTypeFilter: string[],
    hasilVisitFilter: string[],
    flaggingFilter: string[],
  ): T[] => {
    let result = arr;

    if (ticketTypeFilter.length > 0) {
      result = result.filter((t) => {
        const normalized = normalizeJenis(t.jenisTiket);
        return ticketTypeFilter.includes(normalized);
      });
    }

    if (hasilVisitFilter.length > 0) {
      result = result.filter((t) => {
        if (hasilVisitFilter.includes('close') && isTicketClosed(t.status_update)) {
          return true;
        }
        const status = normalizeStatusUpdate(t.status_update);
        return hasilVisitFilter.some((f) => {
          if (f === 'close') return false;
          return status === f;
        });
      });
    }

    if (flaggingFilter.length > 0) {
      result = result.filter((t) => {
        return flaggingFilter.some((f) => {
          if (f === 'FFG') {
            return String(t.guaranteeStatus ?? '').trim().toLowerCase() === 'guarantee';
          }
          if (f === 'GAMAS') {
            const candidates = [
              t.ticketIdGamas,
              (t as any).ticket_id_gamas,
              (t as any).TICKET_ID_GAMAS,
            ];
            const raw = candidates.find((v) => v !== null && v !== undefined);
            const normalized = String(raw ?? '').trim();
            return normalized && !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(normalized.toLowerCase());
          }
          return t.flaggingManja === f;
        });
      });
    }

    return result;
  };

  // Full dataset from useDailyTickets (includes validation tickets)
  const b2cAllTicketTableData = applyClientFilters(
    filteredTickets.filter(isB2CCustomerType).map(mapTicketForTable),
    b2cTicketTypeFilter,
    b2cHasilVisitFilter,
    b2cFlaggingFilter,
  );
  const b2bAllTicketTableData = applyClientFilters(
    filteredTickets.filter(isB2BCustomerType).map(mapTicketForTable),
    b2bTicketTypeFilter,
    b2bHasilVisitFilter,
    b2bFlaggingFilter,
  );

  // Main table data (excludes validation tickets)
  const ticketTableData = filteredTickets
    .filter(t => !isValidationTicket(t))
    .map(mapTicketForTable);
  
  const b2bBackendTicketTableData = b2bAllTicketTableData
    .filter(t => {
      const statusUpdate = (t.status_update ?? '').trim().toLowerCase();
      const status = (t.status ?? '').trim().toLowerCase();
      return !(statusUpdate === 'close' && status !== 'closed');
    });
  const b2cBackendTicketTableData = b2cAllTicketTableData
    .filter(t => {
      const statusUpdate = (t.status_update ?? '').trim().toLowerCase();
      const status = (t.status ?? '').trim().toLowerCase();
      return !(statusUpdate === 'close' && status !== 'closed');
    });

  const clientOperationalFocusItems = useMemo(() => {
    const hasValidGamas = (t: typeof ticketTableData[number]) => {
      const value = String(t.ticketIdGamas ?? '').trim();
      return (
        value.length > 0 &&
        !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
          value.toLowerCase(),
        )
      );
    };

    return buildOperationalFocusItems({
      diamond: ticketTableData.filter(
        (t) => String(t.customerType ?? '').toUpperCase() === 'HVC_DIAMOND',
      ).length,
      p1: ticketTableData.filter((t) => t.flaggingManja === 'P1').length,
      gamas: ticketTableData.filter((t) => hasValidGamas(t)).length,
      ffg: ticketTableData.filter(
        (t) =>
          String(t.guaranteeStatus ?? '').trim().toLowerCase() === 'guarantee',
      ).length,
      carryOver: ticketTableData.filter(
        (t) => String(t.pendingDompis ?? '').trim().length > 0,
      ).length,
    });
  }, [ticketTableData]);

  const operationalFocusItems = useMemo(() => {
    if (!operationsSummary?.focusCounts) return clientOperationalFocusItems;

    return buildOperationalFocusItems(operationsSummary.focusCounts);
  }, [clientOperationalFocusItems, operationsSummary?.focusCounts]);

  // ← ADDED: Split tickets into B2C and B2B arrays with local filtering
  const b2cTicketTableData = ticketTableData
    .filter(isB2CCustomerType)
    // Client-side ctype filter (instant, no re-fetch)
    .filter((t) => {
      if (ctypeFilter === 'all') return true;
      const ct = (t.ctype || t.customerType || '').toUpperCase();
      return ct === ctypeFilter;
    })
    .filter((t) => {
      if (b2cTicketTypeFilter.length === 0) return true;
      const normalized = normalizeJenis(t.jenisTiket);
      return b2cTicketTypeFilter.includes(normalized);
    })
    .filter((t) => {
      if (b2cHasilVisitFilter.length === 0) return true;
      if (
        b2cHasilVisitFilter.includes('close') &&
        isTicketClosed(t.status_update)
      ) {
        return true;
      }
      const status = normalizeStatusUpdate(t.status_update);
      return b2cHasilVisitFilter.some((f) => {
        if (f === 'close') return false;
        return status === f;
      });
    })
    .filter((t) => {
      if (b2cFlaggingFilter.length === 0) return true;
      return b2cFlaggingFilter.some((f) => {
        if (f === 'FFG') {
          return (
            String(t.guaranteeStatus ?? '')
              .trim()
              .toLowerCase() === 'guarantee'
          );
        }
        if (f === 'GAMAS') {
          const candidates = [
            t.ticketIdGamas,
            (t as any).ticket_id_gamas,
            (t as any).TICKET_ID_GAMAS,
          ];
          const raw = candidates.find((v) => v !== null && v !== undefined);
          const normalized = String(raw ?? '').trim();
          return (
            normalized &&
            !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
              normalized.toLowerCase(),
            )
          );
        }
        return t.flaggingManja === f;
      });
    });

  const b2bTicketTableData = ticketTableData
    .filter(isB2BCustomerType)
    .filter((t) => {
      if (b2bTicketTypeFilter.length === 0) return true;
      const normalized = normalizeJenis(t.jenisTiket);
      return b2bTicketTypeFilter.includes(normalized);
    })
    .filter((t) => {
      if (b2bHasilVisitFilter.length === 0) return true;
      if (
        b2bHasilVisitFilter.includes('close') &&
        isTicketClosed(t.status_update)
      ) {
        return true;
      }
      const status = normalizeStatusUpdate(t.status_update);
      return b2bHasilVisitFilter.some((f) => {
        if (f === 'close') return false;
        return status === f;
      });
    })
    .filter((t) => {
      if (b2bFlaggingFilter.length === 0) return true;
      return b2bFlaggingFilter.some((f) => {
        if (f === 'FFG') {
          return (
            String(t.guaranteeStatus ?? '')
              .trim()
              .toLowerCase() === 'guarantee'
          );
        }
        if (f === 'GAMAS') {
          const candidates = [
            t.ticketIdGamas,
            (t as any).ticket_id_gamas,
            (t as any).TICKET_ID_GAMAS,
          ];
          const raw = candidates.find((v) => v !== null && v !== undefined);
          const normalized = String(raw ?? '').trim();
          return (
            normalized &&
            !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
              normalized.toLowerCase(),
            )
          );
        }
        return t.flaggingManja === f;
      });
    });

  // ← ADDED: Helper to derive summary from ticket array
  function deriveSummary(arr: typeof ticketTableData) {
    return {
      total: arr.length,
      open: arr.filter((t) => {
        return isTicketOpenLike(t.status_update);
      }).length,
      assigned: arr.filter((t) => {
        return isTicketInWork(t.status_update);
      }).length,
      close: arr.filter((t) => {
        return isTicketClosed(t.status_update);
      }).length,
    };
  }

  // Table summaries: breakdown from full dataset, total from backend pagination
  const b2cTableSummary = useMemo(() => {
    const breakdown = deriveSummary(b2cTicketTableData);
    return {
      ...breakdown,
      total: b2cPageData.pagination.total,
    };
  }, [b2cTicketTableData, b2cPageData.pagination.total]);

  const b2bTableSummary = useMemo(() => {
    const breakdown = deriveSummary(b2bTicketTableData);
    return {
      ...breakdown,
      total: b2bPageData.pagination.total,
    };
  }, [b2bTicketTableData, b2bPageData.pagination.total]);

  // Search toast + auto-scroll
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchToast(null);
      return;
    }

    const timer = setTimeout(() => {
      const b2cCount = b2cTicketTableData.length;
      const b2bCount = b2bTicketTableData.length;
      const totalFound = b2cCount + b2bCount;

      if (totalFound === 0) {
        setSearchToast({ message: 'Tiket tidak ditemukan', type: 'error' });
        return;
      }

      setSearchToast({
        message: `${totalFound} tiket ditemukan`,
        type: 'success',
      });

      if (b2cCount > 0) {
        b2cSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      } else if (b2bCount > 0) {
        b2bSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, b2cTicketTableData.length, b2bTicketTableData.length]);

  return (
    <>
      <AdminLayout
        onSearch={handleSearch}
        onWorkzoneChange={handleWorkzoneChange}
        selectedWorkzone={workzoneFilter}
      >
        <div className='flex flex-col gap-6'>
          <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
            <div className='bg-surface-2 px-4 py-3 md:px-5 md:py-3.5'>
              <div className='flex items-center justify-between'>
                <div className='text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
                  Semangat pagi pagi pagi ...
                </div>
                {lastSyncLabel && (
                  <div className='flex items-center gap-2'>
                    <div
                      className={clsx(
                        'flex items-center gap-1.5 text-xs',
                        isSyncOverdue
                          ? 'text-amber-400'
                          : 'text-(--text-muted)',
                      )}
                    >
                      <RefreshCw
                        size={11}
                        className={clsx(
                          isSyncOverdue && 'animate-spin',
                          isInProgress && 'animate-spin',
                          syncStatus.inProgress && 'animate-spin text-blue-500',
                        )}
                      />
                      {/* <span>{lastSyncLabel}</span> */}
                      {nextSyncLabel && (
                        <span className='opacity-90'>· {nextSyncLabel}</span>
                      )}
                    </div>
                    {syncStatus.inProgress && (
                      <span className='text-[10px] font-medium text-blue-600 dark:text-blue-400'>
                        Syncing...
                      </span>
                    )}
                    {syncStatus.lastResult && !syncStatus.inProgress && (
                      <span className='text-[10px] font-medium text-green-600 dark:text-green-400'>
                        {syncStatus.lastResult}
                      </span>
                    )}
                    <button
                      onClick={triggerSync}
                      disabled={isInProgress || syncStatus.inProgress}
                      className={clsx(
                        'rounded-lg px-2 py-1 text-[10px] font-semibold transition-all',
                        isInProgress || syncStatus.inProgress
                          ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30',
                      )}
                    >
                      {isInProgress || syncStatus.inProgress
                        ? 'Syncing...'
                        : 'Sync Now'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className='px-4 py-4 md:px-5 md:py-5'>
              <div className='space-y-4 md:space-y-5'>
                <DiamondAlertBanner
                  tickets={diamondTickets.map((t) => ({
                    ticketId: t.ticketId,
                    idTicket: t.idTicket,
                    customerType: t.customerType,
                    reportedAt: t.reportedAt,
                    status: t.status || 'OPEN',
                    overdueHours: Math.max(
                      0,
                      (Date.now() - new Date(t.reportedAt).getTime()) /
                        3_600_000,
                    ),
                    workzone: t.workzone,
                  }))}
                  onAssign={(ticketId, idTicket) => {
                    const ticket = diamondTickets.find(
                      (t) =>
                        t.ticketId === ticketId ||
                        t.idTicket === idTicket ||
                        t.idTicket === Number(ticketId),
                    );
                    const techId = ticket?.teknisiUserId;
                    const numericId = idTicket || Number(ticketId);
                    setAssignModalTicket({
                      idTicket: numericId,
                      ticketCode: ticket?.ticketId,
                      workzone: ticket?.workzone ?? null,
                      technicianName: ticket?.technicianName ?? null,
                      teknisiUserId:
                        techId !== undefined && techId !== null
                          ? techId
                          : undefined,
                    });
                  }}
                />

                <div className='grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4'>
                  <StatCard
                    label='Total'
                    value={stats.total}
                    variant='total'
                    subInfo={`B2C: ${stats.b2c} · B2B: ${stats.b2b}`}
                  />
                  <StatCard
                    label='Unassigned'
                    value={stats.unassigned}
                    variant='unassigned'
                    subInfo={
                      stats.total > 0
                        ? `${((stats.unassigned / stats.total) * 100).toFixed(1)}%`
                        : undefined
                    }
                  />
                  <StatCard
                    label='Assigned'
                    value={stats.assigned}
                    variant='assigned'
                  />
                  <StatCard label='Close' value={stats.close} variant='close' />
                </div>

                <OperationalFocusQueue items={operationalFocusItems} />
              </div>
            </div>
          </div>

          <AdminAccordion
            multiple
            storageKey='admin:dashboard:sections'
            items={[
              {
                id: 'service-areas',
                title: 'Service Areas',
                children: <ServiceAreaTable areas={serviceAreas} />,
              },
              {
                id: 'b2b',
                title: 'B2B Cards',
                defaultOpen: true,
                children: (
                  <div
                    ref={b2bSectionRef}
                    className='flex flex-col gap-4 space-y-3 md:space-y-4'
                  >
                    <B2BSection
                      groupedData={b2bGroupedData}
                      groupSummaries={operationsSummary?.b2bGroups}
                      summary={b2bSectionSummary}
                    />
                    <FilterBarB2B
                      ticketType={b2bTicketTypeFilter}
                      statusUpdate={b2bHasilVisitFilter}
                      flagging={b2bFlaggingFilter}
                      onTypeChange={handleB2bTicketTypeChange}
                      onStatusChange={handleB2bHasilVisitChange}
                      onFlaggingChange={handleB2bFlaggingChange}
                    />
                    <TicketTableTabs
                      section='b2b'
                      accentColor='#3b82f6'
                      mainTable={
                        <TicketTableB2B
                          tickets={b2bPageData.tickets}
                          tableSummary={b2bTableSummary}
                          flaggingFilter={b2bFlaggingFilter}
                          loading={b2bPageData.loading}
                          isRefreshing={b2bPageData.isRefreshing}
                          onAssign={handleAssignClick}
                          downloadFilters={{
                            dept: 'b2b',
                            ticketType: b2bTicketTypeFilter,
                            statusUpdate: b2bHasilVisitFilter,
                            flagging: b2bFlaggingFilter,
                          }}
                          pagination={{
                            currentPage: b2bPageData.pagination.currentPage,
                            totalPages: b2bPageData.pagination.totalPages,
                            total: b2bPageData.pagination.total,
                            limit: b2bPageData.pagination.limit,
                            onPageChange: (page) => {
                              setB2bPage(page);
                            },
                          }}
                        />
                      }
                      tickets={b2bPageData.tickets}
                      totalCount={b2bPageData.pagination.total}
                      loading={b2bPageData.loading}
                      isRefreshing={b2bPageData.isRefreshing}
                      onAssign={handleAssignClick}
                    />
                  </div>
                ),
              },
              {
                id: 'b2c',
                title: 'B2C Cards',
                defaultOpen: true,
                children: (
                  <div
                    ref={b2cSectionRef}
                    className='flex flex-col gap-4 space-y-3 md:space-y-4'
                  >
                    <B2CSection
                      data={{ ...b2cStats, summary: b2cSectionSummary }}
                      activeType={ctypeFilter}
                      onSelectType={handleB2cCustomerTypeSelect}
                    />

                    <FilterBarB2C
                      ticketType={b2cTicketTypeFilter}
                      statusUpdate={b2cHasilVisitFilter}
                      flagging={b2cFlaggingFilter}
                      onTypeChange={handleB2cTicketTypeChange}
                      onStatusChange={handleB2cHasilVisitChange}
                      onFlaggingChange={handleB2cFlaggingChange}
                    />

                    <TicketTableTabs
                      section='b2c'
                      accentColor='#10b981'
                      mainTable={
                        <TicketTable
                          tickets={b2cPageData.tickets}
                          tableSummary={b2cTableSummary}
                          flaggingFilter={b2cFlaggingFilter}
                          loading={b2cPageData.loading}
                          isRefreshing={b2cPageData.isRefreshing}
                          onAssign={handleAssignClick}
                          downloadFilters={{
                            dept: 'b2c',
                            ticketType: b2cTicketTypeFilter,
                            statusUpdate: b2cHasilVisitFilter,
                            flagging: b2cFlaggingFilter,
                          }}
                          pagination={{
                            currentPage: b2cPageData.pagination.currentPage,
                            totalPages: b2cPageData.pagination.totalPages,
                            total: b2cPageData.pagination.total,
                            limit: b2cPageData.pagination.limit,
                            onPageChange: (page) => {
                              setB2cPage(page);
                            },
                          }}
                        />
                      }
                      tickets={b2cPageData.tickets}
                      totalCount={b2cPageData.pagination.total}
                      loading={b2cPageData.loading}
                      isRefreshing={b2cPageData.isRefreshing}
                      onAssign={handleAssignClick}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>
      </AdminLayout>

      <NewTicketModal
        isOpen={showNewTicketModal}
        onClose={() => setShowNewTicketModal(false)}
        onCreated={refresh}
      />

      {assignModalTicket && (
        <AssignTechnicianModal
          ticketId={assignModalTicket.idTicket}
          ticketCode={assignModalTicket.ticketCode}
          ticketWorkzone={assignModalTicket.workzone}
          currentTechnicianId={assignModalTicket.teknisiUserId}
          currentTechnicianName={assignModalTicket.technicianName}
          isOpen
          onClose={() => {
            setAssignModalTicket(null);
            if (pendingRefreshRef.current) {
              pendingRefreshRef.current = false;
              setTimeout(() => {
                refresh();
                refreshExpired();
              }, 100);
            }
          }}
          onAssign={async () => {
            await new Promise((r) => setTimeout(r, 500));
            await refresh();
            await refreshExpired();
            await refetchOperationsSummary();
            await b2bPageData.refresh();
            await b2cPageData.refresh();
            pendingRefreshRef.current = false;
            setAssignModalTicket(null);
          }}
        />
      )}

      <SearchToast
        message={searchToast?.message ?? null}
        type={searchToast?.type ?? 'idle'}
        onDismiss={() => setSearchToast(null)}
      />
    </>
  );
}
