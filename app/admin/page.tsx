'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/app/components/layout/AdminLayout';
import NewTicketModal from '@/app/admin/components/dashboard/create/NewTicketModal';
import AssignTechnicianModal from '@/app/admin/components/dashboard/assign/AssignTechnicianModal';
import Select from '@/app/components/form/Select';
import { useAdminTickets } from '@/app/hooks/useAdminTickets';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { useTicketStats } from '@/app/hooks/useTicketStats';
import { useExpiredTickets } from '@/app/hooks/useExpiredTickets';
import { useOpenDiamondTickets } from '@/app/hooks/useOpenDiamondTickets';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';
import TicketStats from '../components/tickets/TicketStats';
import CustomerTypeTabFilter from '@/app/components/tickets/CustomerTypeTabFilter';
import CustomerTypeBadge from '@/app/components/tickets/CustomerTypeBadge';
import TicketAgeAlarm from '@/app/components/tickets/TicketAgeAlarm';
import { TicketCtype, Ticket } from '@/app/types/ticket';

import StatCard from './components/dashboard/StatCard';
import { DiamondAlertBanner } from './components/dashboard/AlertBanner';
import { DeptFilterBar } from './components/dashboard/DeptFilterBar';
import B2BSection from './components/dashboard/B2BSection';
import B2CSection from './components/dashboard/B2CSection';
import ServiceAreaTable from './components/dashboard/ServiceAreaTable';
import TicketTable from './components/dashboard/TicketTable';
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

export default function TicketPage() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
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
  const [ticketTypeFilter, setTicketTypeFilter] = useState<
    'all' | 'reguler' | 'sqm' | 'unspec'
  >('all');
  const [hasilVisitFilter, setHasilVisitFilter] = useState<
    | 'all'
    | 'OPEN'
    | 'ASSIGNED'
    | 'ON_PROGRESS'
    | 'PENDING'
    | 'ESCALATED'
    | 'CANCELLED'
    | 'CLOSE'
  >('all');

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
    data: statsApi,
    byServiceArea,
    byCustomerType,
    refresh: refreshStats,
  } = useTicketStats(workzoneFilter || undefined, {
    dept: deptFilter,
    ticketType: ticketTypeFilter,
    hasilVisit: hasilVisitFilter,
  });

  const { byCustomerType: byCustomerTypeAll } = useTicketStats(
    workzoneFilter || undefined,
    {
      dept: 'all',
      ticketType: ticketTypeFilter,
      hasilVisit: hasilVisitFilter,
    },
  );

  const { tickets: expiredTickets, refresh: refreshExpired } =
    useExpiredTickets(workzoneFilter || undefined, {
      dept: deptFilter,
      ticketType: ticketTypeFilter,
      hasilVisit: hasilVisitFilter,
    });

  const { tickets: diamondTickets, refresh: refreshDiamond } =
    useOpenDiamondTickets(workzoneFilter || undefined, {
      dept: deptFilter,
      ticketType: ticketTypeFilter,
    });

  const { tickets, loading, pagination, refresh } = useAdminTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
    ctypeFilter !== 'all' ? ctypeFilter : undefined,
    hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
    deptFilter !== 'all' ? deptFilter : undefined,
    ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
  );

  useAutoRefresh({
    intervalMs: 30_000,
    refreshers: [refresh, refreshStats, refreshExpired, refreshDiamond],
    pauseWhen: [showNewTicketModal, Boolean(assignModalTicket)],
  });

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
    const raw = ((t.hasilVisit ?? t.status) || '').toString();
    return raw.trim().toUpperCase().replace(/\s+/g, '_');
  }, []);

  const normalizeTicketType = useCallback((t: Ticket) => {
    const raw = (t.jenisTiket || '').toString();
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_');
    if (!normalized) return '';
    if (normalized.includes('sqm')) return 'sqm';
    if (normalized.includes('reguler') || normalized.includes('regular')) {
      return 'reguler';
    }
    return normalized;
  }, []);

  const stats = useMemo(() => {
    const total = Number(statsApi?.total || 0);
    const unassigned = Number(statsApi?.unassigned || 0);
    const assigned = Number(statsApi?.assigned || 0);
    const closed = Number(statsApi?.closed || 0);

    const b2c = byCustomerType.reduce(
      (acc, row) => acc + Number(row.total || 0),
      0,
    );
    const other = Math.max(0, total - b2c);

    return { total, unassigned, assigned, closed, b2c, other };
  }, [byCustomerType, statsApi]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setCurrentPage(1);
  }, []);

  const handleCtypeChange = useCallback((ctype: TicketCtype | 'all') => {
    setCtypeFilter(ctype);
    setCurrentPage(1);
  }, []);

  const handleB2cCustomerTypeSelect = useCallback(
    (ctype: TicketCtype | 'all') => {
      // Ensure the table view matches the B2C card selection.
      setDeptFilter('b2c');
      setCtypeFilter(ctype);
      setCurrentPage(1);
    },
    [],
  );

  const handleClearCtypeFilter = useCallback(() => {
    setCtypeFilter('all');
    setCurrentPage(1);
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

  const handleTicketTypeChange = (
    type: 'all' | 'reguler' | 'sqm' | 'unspec',
  ) => {
    setTicketTypeFilter(type);
    setCurrentPage(1);
  };

  const handleHasilVisitChange = (
    status:
      | 'all'
      | 'OPEN'
      | 'ASSIGNED'
      | 'ON_PROGRESS'
      | 'PENDING'
      | 'ESCALATED'
      | 'CANCELLED'
      | 'CLOSE',
  ) => {
    setHasilVisitFilter(status);
    setCurrentPage(1);
  };

  // IMPORTANT: Admin ticket table pagination happens on the client.
  // Keep this list as the full dataset for sorting + pagination in TicketTable.
  const filteredTickets = tickets;

  // expiredTickets comes from /api/tickets/expired (not paginated)

  const getCounts = (arr: Ticket[]) => ({
    total: arr.length,
    open: arr.filter((t) => normalizeVisitStatus(t) === 'OPEN').length,
    assigned: arr.filter((t) => {
      const st = normalizeVisitStatus(t);
      return st === 'ASSIGNED' || st === 'ON_PROGRESS';
    }).length,
    closed: arr.filter((t) => {
      const st = normalizeVisitStatus(t);
      return st === 'CLOSE' || st === 'CLOSED';
    }).length,
    regulerCount: arr.filter((t) => {
      const jt = normalizeTicketType(t);
      return jt === 'reguler';
    }).length,
    sqmCount: arr.filter((t) => {
      const jt = normalizeTicketType(t);
      return jt === 'sqm';
    }).length,
  });

  const b2bStats = {
    datinK1: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'datin_k1'),
    ),
    datinK1K2: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'datin_k1k2'),
    ),
    datinK3: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'datin_k3'),
    ),
    indibiz4: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'indibiz_4'),
    ),
    indibiz24: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'indibiz_24'),
    ),
    reseller6: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'reseller_6'),
    ),
    reseller36: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'reseller_36'),
    ),
    wifi24: getCounts(
      filteredTickets.filter((t) => normalizeCustomerType(t) === 'wifi_24'),
    ),
    // Summary calculations for each group
    summary: {
      datin: {
        total: 0,
        open: 0,
        assigned: 0,
        closed: 0,
        regulerCount: 0,
        sqmCount: 0,
      },
      indibiz: {
        total: 0,
        open: 0,
        assigned: 0,
        closed: 0,
        regulerCount: 0,
        sqmCount: 0,
      },
      resellerWifi: {
        total: 0,
        open: 0,
        assigned: 0,
        closed: 0,
        regulerCount: 0,
        sqmCount: 0,
      },
    },
  };

  // Calculate B2B group summaries
  b2bStats.summary.datin = {
    total:
      b2bStats.datinK1.total +
      b2bStats.datinK1K2.total +
      b2bStats.datinK3.total,
    open:
      b2bStats.datinK1.open + b2bStats.datinK1K2.open + b2bStats.datinK3.open,
    assigned:
      b2bStats.datinK1.assigned +
      b2bStats.datinK1K2.assigned +
      b2bStats.datinK3.assigned,
    closed:
      b2bStats.datinK1.closed +
      b2bStats.datinK1K2.closed +
      b2bStats.datinK3.closed,
    regulerCount:
      b2bStats.datinK1.regulerCount +
      b2bStats.datinK1K2.regulerCount +
      b2bStats.datinK3.regulerCount,
    sqmCount:
      b2bStats.datinK1.sqmCount +
      b2bStats.datinK1K2.sqmCount +
      b2bStats.datinK3.sqmCount,
  };

  b2bStats.summary.indibiz = {
    total: b2bStats.indibiz4.total + b2bStats.indibiz24.total,
    open: b2bStats.indibiz4.open + b2bStats.indibiz24.open,
    assigned: b2bStats.indibiz4.assigned + b2bStats.indibiz24.assigned,
    closed: b2bStats.indibiz4.closed + b2bStats.indibiz24.closed,
    regulerCount:
      b2bStats.indibiz4.regulerCount + b2bStats.indibiz24.regulerCount,
    sqmCount: b2bStats.indibiz4.sqmCount + b2bStats.indibiz24.sqmCount,
  };

  b2bStats.summary.resellerWifi = {
    total:
      b2bStats.reseller6.total +
      b2bStats.reseller36.total +
      b2bStats.wifi24.total,
    open:
      b2bStats.reseller6.open + b2bStats.reseller36.open + b2bStats.wifi24.open,
    assigned:
      b2bStats.reseller6.assigned +
      b2bStats.reseller36.assigned +
      b2bStats.wifi24.assigned,
    closed:
      b2bStats.reseller6.closed +
      b2bStats.reseller36.closed +
      b2bStats.wifi24.closed,
    regulerCount:
      b2bStats.reseller6.regulerCount +
      b2bStats.reseller36.regulerCount +
      b2bStats.wifi24.regulerCount,
    sqmCount:
      b2bStats.reseller6.sqmCount +
      b2bStats.reseller36.sqmCount +
      b2bStats.wifi24.sqmCount,
  };

  const b2cStats = useMemo(() => {
    const map = new Map(
      (byCustomerTypeAll || []).map((row) => [String(row.ctype), row] as const),
    );

    const pick = (ctype: string) => {
      const row = map.get(ctype);
      return {
        total: Number(row?.total || 0),
        open: Number(row?.open || 0),
        assigned: Number(row?.assigned || 0),
        closed: Number(row?.closed || 0),
        regulerCount: Number(row?.regulerTotal || 0),
        sqmCount: Number(row?.sqmTotal || 0),
        unspecCount: Number(row?.unspecTotal || 0),
        ffgCount: Number(row?.ffg || 0),
        p1Count: Number(row?.p1 || 0),
        pPlusCount: Number(row?.pPlus || 0),
      };
    };

    const reguler = pick('REGULER');
    const hvcGold = pick('HVC_GOLD');
    const hvcPlatinum = pick('HVC_PLATINUM');
    const hvcDiamond = pick('HVC_DIAMOND');

    // Calculate summary totals
    const summary = {
      total:
        reguler.total + hvcGold.total + hvcPlatinum.total + hvcDiamond.total,
      open: reguler.open + hvcGold.open + hvcPlatinum.open + hvcDiamond.open,
      assigned:
        reguler.assigned +
        hvcGold.assigned +
        hvcPlatinum.assigned +
        hvcDiamond.assigned,
      closed:
        reguler.closed +
        hvcGold.closed +
        hvcPlatinum.closed +
        hvcDiamond.closed,
      regulerCount:
        reguler.regulerCount +
        hvcGold.regulerCount +
        hvcPlatinum.regulerCount +
        hvcDiamond.regulerCount,
      sqmCount:
        reguler.sqmCount +
        hvcGold.sqmCount +
        hvcPlatinum.sqmCount +
        hvcDiamond.sqmCount,
      unspecCount:
        reguler.unspecCount +
        hvcGold.unspecCount +
        hvcPlatinum.unspecCount +
        hvcDiamond.unspecCount,
      ffgCount:
        reguler.ffgCount +
        hvcGold.ffgCount +
        hvcPlatinum.ffgCount +
        hvcDiamond.ffgCount,
      p1Count:
        reguler.p1Count +
        hvcGold.p1Count +
        hvcPlatinum.p1Count +
        hvcDiamond.p1Count,
      pPlusCount:
        reguler.pPlusCount +
        hvcGold.pPlusCount +
        hvcPlatinum.pPlusCount +
        hvcDiamond.pPlusCount,
    };

    return {
      summary,
      reguler,
      hvcGold,
      hvcPlatinum,
      hvcDiamond,
    };
  }, [byCustomerTypeAll]);

  const b2cTypeCounts = useMemo(() => {
    const map = new Map(
      (byCustomerTypeAll || []).map((row) => [String(row.ctype), row] as const),
    );
    const totalB2c = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND']
      .map((k) => Number(map.get(k)?.total || 0))
      .reduce((a, b) => a + b, 0);

    return {
      all: totalB2c,
      REGULER: Number(map.get('REGULER')?.total || 0),
      HVC_GOLD: Number(map.get('HVC_GOLD')?.total || 0),
      HVC_PLATINUM: Number(map.get('HVC_PLATINUM')?.total || 0),
      HVC_DIAMOND: Number(map.get('HVC_DIAMOND')?.total || 0),
    };
  }, [byCustomerTypeAll]);

  const serviceAreas = useMemo(() => {
    const rows = (byServiceArea || []).map((row) => ({
      name: row.nama_sa,
      total: Number(row.total || 0),
      open: Number(row.open || 0),
      assigned: Number(row.assigned || 0),
      closed: Number(row.closed || 0),
      unassigned: Number(row.unassigned || 0),
    }));

    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, 5);
  }, [byServiceArea]);

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
    hasilVisit: t.hasilVisit,
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
                    subInfo={`B2C: ${stats.b2c} · Other: ${stats.other}`}
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
                  <StatCard
                    label='Closed'
                    value={stats.closed}
                    variant='closed'
                  />
                </div>
              </div>
            </div>
          </div>

          <AdminAccordion
            multiple
            storageKey='admin:dashboard:sections'
            items={[
              {
                id: 'b2b',
                title: 'B2B Cards',
                defaultOpen: true,
                children: <B2BSection data={b2bStats} />,
              },
              {
                id: 'b2c',
                title: 'B2C Cards',
                defaultOpen: true,
                children: (
                  <div className='space-y-3 md:space-y-4'>
                    <B2CSection
                      data={b2cStats}
                      activeType={ctypeFilter}
                      onSelectType={handleB2cCustomerTypeSelect}
                    />
                  </div>
                ),
              },
              {
                id: 'service-areas',
                title: 'Service Areas',
                children: <ServiceAreaTable areas={serviceAreas} />,
              },
              {
                id: 'tickets',
                title: 'Tickets',
                defaultOpen: true,
                children: (
                  <div className='flex flex-col gap-4'>
                    <DeptFilterBar
                      onDeptChange={handleDeptChange}
                      onTypeChange={handleTicketTypeChange}
                      onStatusChange={handleHasilVisitChange}
                    />

                    <TicketTable
                      tickets={ticketTableData}
                      loading={loading}
                      onAssign={handleAssignClick}
                      pagination={{
                        currentPage: pagination.currentPage,
                        totalPages: pagination.totalPages,
                        total: pagination.total,
                        limit: pagination.limit,
                        onPageChange: setCurrentPage,
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
