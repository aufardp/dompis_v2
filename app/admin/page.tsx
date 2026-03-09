'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/app/components/layout/AdminLayout';
import NewTicketModal from '@/app/admin/components/dashboard/create/NewTicketModal';
import AssignTechnicianModal from '@/app/admin/components/dashboard/assign/AssignTechnicianModal';
import { useDailyTickets } from '@/app/hooks/useDailyTickets';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { useExpiredTickets } from '@/app/hooks/useExpiredTickets';
import { useOpenDiamondTickets } from '@/app/hooks/useOpenDiamondTickets';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import { TicketCtype, Ticket } from '@/app/types/ticket';
import {
  normalizeJenis,
  isB2CJenis,
  isB2BJenis,
} from '@/app/libs/tickets/jenis';
import { isTicketClosed } from '@/app/libs/ticket-utils';

import StatCard from './components/dashboard/StatCard';
import { DiamondAlertBanner } from './components/dashboard/AlertBanner';
import { FilterBarB2C } from './components/dashboard/filterbarb2c';
import { FilterBarB2B } from './components/dashboard/filterbarb2b';
import B2BSection from './components/dashboard/B2BSection';
import B2CSection from './components/dashboard/B2CSection';
import ServiceAreaTable from './components/dashboard/ServiceAreaTable';
import TicketTable from './components/dashboard/TicketTable';
import TicketTableB2B from './components/dashboard/TicketTableB2B';
import AdminAccordion from '@/app/components/ui/AdminAccordion';

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
  ffgCount: number;
  p1Count: number;
  pPlusCount: number;
}

interface B2BData {
  sqmCcan: JenisCounts;
  indibiz: JenisCounts;
  datin: JenisCounts;
  reseller: JenisCounts;
  wifiId: JenisCounts;
  summary: JenisCounts;
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

  // B2C filter state
  const [b2cTicketTypeFilter, setB2cTicketTypeFilter] = useState<
    'all' | 'reguler' | 'sqm' | 'hvc' | 'unspec'
  >('all');
  const [b2cHasilVisitFilter, setB2cHasilVisitFilter] = useState<
    'all' | 'open' | 'assigned' | 'on_progress' | 'pending' | 'close'
  >('all');
  const [b2cFlaggingFilter, setB2cFlaggingFilter] = useState<
    'all' | 'P1' | 'P+'
  >('all');

  // B2B filter state
  const [b2bTicketTypeFilter, setB2bTicketTypeFilter] = useState<
    'all' | 'sqm-ccan' | 'indibiz' | 'datin' | 'reseller' | 'wifi-id'
  >('all');
  const [b2bHasilVisitFilter, setB2bHasilVisitFilter] = useState<
    'all' | 'open' | 'assigned' | 'on_progress' | 'pending' | 'close'
  >('all');
  const [b2bFlaggingFilter, setB2bFlaggingFilter] = useState<
    'all' | 'P1' | 'P+'
  >('all');

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

  const { tickets: expiredTickets, refresh: refreshExpired } =
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
  const { tickets, loading, pagination, refresh } = useDailyTickets(
    searchQuery,
    1,
    workzoneFilter || undefined,
    undefined, // ctype: filter di client-side (tidak perlu fetch ulang)
    undefined, // hasilVisitFilter - now handled per section
    deptFilter !== 'all' ? deptFilter : undefined,
    undefined, // ticketTypeFilter - now handled per section
  );

  // SSE-based real-time updates (primary mechanism)
  useTicketEvents({
    onInvalidate: () => {
      // Only refresh if no modal is open
      if (!showNewTicketModal && !assignModalTicket) {
        refresh();
      }
    },
    enabled: true,
    debounceMs: 500,
  });

  // Polling as fallback (reduced frequency since SSE handles real-time)
  useAutoRefresh({
    intervalMs: 60_000,
    refreshers: [refresh, refreshExpired, refreshDiamond],
    pauseWhen: [showNewTicketModal, Boolean(assignModalTicket)],
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY OPERATIONAL SUMMARY — computed from daily tickets (NOT stats API)
  // This ensures summary and table are ALWAYS in sync (same data scope)
  // ═══════════════════════════════════════════════════════════════════════

  // Filter B2C tickets from daily dataset - USE SAME LOGIC AS TABLE
  const b2cDailyTickets = useMemo(
    () => tickets.filter((t) => isB2CJenis(t.jenisTiket)),
    [tickets],
  );

  // Compute summary from B2C daily tickets
  const b2cDailySummary = useMemo(() => {
    const summary = {
      total: b2cDailyTickets.length,
      open: 0,
      assigned: 0,
      close: 0,
      regulerCount: 0,
      sqmCount: 0,
      unspecCount: 0,
      ffgCount: 0,
      p1Count: 0,
      pPlusCount: 0,
    };

    for (const t of b2cDailyTickets) {
      const s = (t.STATUS_UPDATE ?? '').trim().toLowerCase();
      const isClose = s === 'close';
      const isAssigned =
        s === 'assigned' || s === 'on_progress' || s === 'pending';
      const jenisType = normalizeJenis(t.jenisTiket);

      // Status counts
      if (isClose) {
        summary.close++;
      } else if (isAssigned) {
        summary.assigned++;
      } else {
        summary.open++;
      }

      // Jenis breakdown
      if (jenisType === 'reguler') summary.regulerCount++;
      else if (jenisType === 'sqm') summary.sqmCount++;
      else summary.unspecCount++;

      // Flagging counts
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
        regulerCount: number;
        sqmCount: number;
        unspecCount: number;
        ffgCount: number;
        p1Count: number;
        pPlusCount: number;
      }
    >();

    const initType = () => ({
      total: 0,
      open: 0,
      assigned: 0,
      close: 0,
      regulerCount: 0,
      sqmCount: 0,
      unspecCount: 0,
      ffgCount: 0,
      p1Count: 0,
      pPlusCount: 0,
    });

    for (const t of b2cDailyTickets) {
      const type = (t.ctype || t.customerType || 'Unspec').toUpperCase();
      if (!typeMap.has(type)) typeMap.set(type, initType());

      const data = typeMap.get(type)!;
      data.total++;

      const s = (t.STATUS_UPDATE ?? '').trim().toLowerCase();
      const isClose = s === 'close';
      const isAssigned =
        s === 'assigned' || s === 'on_progress' || s === 'pending';
      const jenisType = normalizeJenis(t.jenisTiket);

      if (isClose) data.close++;
      else if (isAssigned) data.assigned++;
      else data.open++;

      if (jenisType === 'reguler') data.regulerCount++;
      else if (jenisType === 'sqm') data.sqmCount++;
      else data.unspecCount++;

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
      (t.STATUS_UPDATE ?? t.hasilVisit ?? t.status) ||
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

  const stats = useMemo(() => {
    const b2cTickets = tickets.filter((t) => isB2CJenis(t.jenisTiket));
    const b2bTickets = tickets.filter((t) => isB2BJenis(t.jenisTiket));

    const total = tickets.length;
    const unassigned = tickets.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return !s || s === 'open';
    }).length;
    const assigned = tickets.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return s === 'assigned' || s === 'on_progress' || s === 'pending';
    }).length;
    const close = tickets.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return s === 'close';
    }).length;

    const b2c = b2cTickets.length;
    const b2b = b2bTickets.length;

    return { total, unassigned, assigned, close, b2c, b2b };
  }, [tickets]);

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
    const ticket = tickets.find((t) => t.idTicket === ticketId);
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

  const handleB2cTicketTypeChange = (
    type: 'all' | 'reguler' | 'sqm' | 'hvc' | 'unspec',
  ) => {
    setB2cTicketTypeFilter(type);
    setB2cPage(1);
  };

  const handleB2cHasilVisitChange = (
    status: 'all' | 'open' | 'assigned' | 'on_progress' | 'pending' | 'close',
  ) => {
    setB2cHasilVisitFilter(status);
    setB2cPage(1);
  };

  const handleB2cFlaggingChange = (flagging: 'all' | 'P1' | 'P+') => {
    setB2cFlaggingFilter(flagging);
    setB2cPage(1);
  };

  const handleB2bTicketTypeChange = (
    type: 'all' | 'sqm-ccan' | 'indibiz' | 'datin' | 'reseller' | 'wifi-id',
  ) => {
    setB2bTicketTypeFilter(type);
    setB2bPage(1);
  };

  const handleB2bHasilVisitChange = (
    status: 'all' | 'open' | 'assigned' | 'on_progress' | 'pending' | 'close',
  ) => {
    setB2bHasilVisitFilter(status);
    setB2bPage(1);
  };

  const handleB2bFlaggingChange = (flagging: 'all' | 'P1' | 'P+') => {
    setB2bFlaggingFilter(flagging);
    setB2bPage(1);
  };

  // IMPORTANT: Admin ticket table pagination happens on the client.
  // Keep this list as the full dataset for sorting + pagination in TicketTable.
  const filteredTickets = tickets;

  // expiredTickets comes from /api/tickets/expired (not paginated)

  const getCounts = (arr: Ticket[]) => ({
    total: arr.length,
    open: arr.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return !s || s === 'open';
    }).length,
    assigned: arr.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return s === 'assigned' || s === 'on_progress' || s === 'pending';
    }).length,
    close: arr.filter((t) => {
      const s = (t.STATUS_UPDATE ?? '').toLowerCase();
      return s === 'close';
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

  const b2bStats: B2BData = {
    sqmCcan,
    indibiz,
    datin,
    reseller,
    wifiId,
    summary: {
      total:
        sqmCcan.total +
        indibiz.total +
        datin.total +
        reseller.total +
        wifiId.total,
      open:
        sqmCcan.open + indibiz.open + datin.open + reseller.open + wifiId.open,
      assigned:
        sqmCcan.assigned +
        indibiz.assigned +
        datin.assigned +
        reseller.assigned +
        wifiId.assigned,
      close:
        sqmCcan.close +
        indibiz.close +
        datin.close +
        reseller.close +
        wifiId.close,
      ffgCount:
        sqmCcan.ffgCount +
        indibiz.ffgCount +
        datin.ffgCount +
        reseller.ffgCount +
        wifiId.ffgCount,
      p1Count:
        sqmCcan.p1Count +
        indibiz.p1Count +
        datin.p1Count +
        reseller.p1Count +
        wifiId.p1Count,
      pPlusCount:
        sqmCcan.pPlusCount +
        indibiz.pPlusCount +
        datin.pPlusCount +
        reseller.pPlusCount +
        wifiId.pPlusCount,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // B2C STATS — NOW USING DAILY OPERATIONAL SCOPE (aligned with table)
  // ═══════════════════════════════════════════════════════════════════════
  const b2cStats = useMemo(() => {
    const getTypeData = (type: string) => {
      const data = b2cDailyByType.get(type);
      return (
        data || {
          total: 0,
          open: 0,
          assigned: 0,
          close: 0,
          regulerCount: 0,
          sqmCount: 0,
          unspecCount: 0,
          ffgCount: 0,
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

  const b2cTypeCounts = useMemo(() => {
    const b2cTickets = tickets.filter((t) => isB2CJenis(t.jenisTiket));
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

  const serviceAreas = useMemo(() => {
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
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return !s || s === 'open';
      }).length,
      open: arr.filter((t) => (t.STATUS_UPDATE ?? '').toLowerCase() === 'open')
        .length,
      assigned: arr.filter((t) => {
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return s === 'assigned' || s === 'on_progress' || s === 'pending';
      }).length,
      close: arr.filter((t) => {
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return s === 'close';
      }).length,
    }));

    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, 5);
  }, [tickets]);

  const ticketTableData = filteredTickets.map((t) => ({
    idTicket: t.idTicket,
    ticket: t.ticket,
    serviceNo: t.serviceNo,
    contactName: t.contactName,
    contactPhone: t.contactPhone,
    alamat: t.alamat,
    bookingDate: t.bookingDate,
    ctype: t.ctype,
    customerType: t.customerType,
    summary: t.summary,
    jenisTiket: t.jenisTiket,
    workzone: t.workzone,
    technicianName: t.technicianName,
    teknisiUserId: t.teknisiUserId,
    STATUS_UPDATE: t.STATUS_UPDATE,
    closedAt: t.closedAt,
    reportedDate: t.reportedDate,
    status: t.status,
    maxTtrReguler: t.maxTtrReguler,
    maxTtrGold: t.maxTtrGold,
    maxTtrPlatinum: t.maxTtrPlatinum,
    maxTtrDiamond: t.maxTtrDiamond,
    flaggingManja: t.flaggingManja,
    guaranteeStatus: t.guaranteeStatus,
  }));

  // ← ADDED: Split tickets into B2C and B2B arrays with local filtering
  const b2cTicketTableData = ticketTableData
    .filter((t) => isB2CJenis(t.jenisTiket))
    // Client-side ctype filter (instant, no re-fetch)
    .filter((t) => {
      if (ctypeFilter === 'all') return true;
      const ct = (t.ctype || t.customerType || '').toUpperCase();
      return ct === ctypeFilter;
    })
    .filter((t) => {
      if (b2cTicketTypeFilter === 'all') return true;
      const normalized = normalizeJenis(t.jenisTiket);
      return normalized === b2cTicketTypeFilter;
    })
    .filter((t) => {
      if (b2cHasilVisitFilter === 'all') return true;
      if (b2cHasilVisitFilter === 'close') return isTicketClosed(t.STATUS_UPDATE);
      const status = (t.STATUS_UPDATE ?? '').toLowerCase();
      return status === b2cHasilVisitFilter;
    })
    .filter((t) => {
      if (b2cFlaggingFilter === 'all') return true;
      return t.flaggingManja === b2cFlaggingFilter;
    });

  const b2bTicketTableData = ticketTableData
    .filter((t) => isB2BJenis(t.jenisTiket))
    .filter((t) => {
      if (b2bTicketTypeFilter === 'all') return true;
      const normalized = normalizeJenis(t.jenisTiket);
      return normalized === b2bTicketTypeFilter;
    })
    .filter((t) => {
      if (b2bHasilVisitFilter === 'all') return true;
      if (b2bHasilVisitFilter === 'close') return isTicketClosed(t.STATUS_UPDATE);
      const status = (t.STATUS_UPDATE ?? '').toLowerCase();
      return status === b2bHasilVisitFilter;
    })
    .filter((t) => {
      if (b2bFlaggingFilter === 'all') return true;
      return t.flaggingManja === b2bFlaggingFilter;
    });

  // ← ADDED: Helper to derive summary from ticket array
  function deriveSummary(arr: typeof ticketTableData) {
    return {
      total: arr.length,
      open: arr.filter((t) => {
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return !s || s === 'open';
      }).length,
      assigned: arr.filter((t) => {
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return s === 'assigned' || s === 'on_progress' || s === 'pending';
      }).length,
      close: arr.filter((t) => {
        const s = (t.STATUS_UPDATE ?? '').toLowerCase();
        return s === 'close';
      }).length,
    };
  }

  const b2cTableSummary = deriveSummary(b2cTicketTableData);
  const b2bTableSummary = deriveSummary(b2bTicketTableData);

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
              <div className='text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
                Semangat pagi pagi pagi ...
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
                    overdueHours: 0,
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
                  <div className='flex flex-col gap-4 space-y-3 md:space-y-4'>
                    <B2BSection data={b2bStats} />,
                    <FilterBarB2B
                      ticketType={b2bTicketTypeFilter}
                      statusUpdate={b2bHasilVisitFilter}
                      flagging={b2bFlaggingFilter}
                      onTypeChange={handleB2bTicketTypeChange}
                      onStatusChange={handleB2bHasilVisitChange}
                      onFlaggingChange={handleB2bFlaggingChange}
                    />
                    <TicketTableB2B
                      tickets={b2bTicketTableData}
                      tableSummary={b2bTableSummary}
                      loading={loading}
                      onAssign={handleAssignClick}
                      pagination={{
                        currentPage: b2bPage,
                        totalPages: Math.max(
                          1,
                          Math.ceil(b2bTicketTableData.length / 10),
                        ),
                        total: b2bTicketTableData.length,
                        limit: 10,
                        onPageChange: (page) => {
                          setB2bPage(page);
                        },
                      }}
                    />
                  </div>
                ),
              },
              {
                id: 'b2c',
                title: 'B2C Cards',
                defaultOpen: true,
                children: (
                  <div className='flex flex-col gap-4 space-y-3 md:space-y-4'>
                    <B2CSection
                      data={b2cStats}
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

                    <TicketTable
                      tickets={b2cTicketTableData}
                      tableSummary={b2cTableSummary}
                      loading={loading}
                      onAssign={handleAssignClick}
                      pagination={{
                        currentPage: b2cPage,
                        totalPages: Math.max(
                          1,
                          Math.ceil(b2cTicketTableData.length / 10),
                        ),
                        total: b2cTicketTableData.length,
                        limit: 10,
                        onPageChange: (page) => {
                          setB2cPage(page);
                        },
                      }}
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
          onClose={() => setAssignModalTicket(null)}
          onAssign={async () => {
            await refresh();
            setAssignModalTicket(null);
          }}
        />
      )}
    </>
  );
}
