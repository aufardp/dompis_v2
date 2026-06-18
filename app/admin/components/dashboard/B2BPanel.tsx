'use client';

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { getB2BGroupKey } from '@/app/config/b2b-groups';
import {
  countStatusBuckets,
  CLOSE_STATUS_VALUES,
  isTicketClosed,
  isTicketInWork,
  isTicketOpenLike,
  normalizeStatusUpdate,
} from '@/app/libs/ticket-utils';
import B2BSection from './B2BSection';
import { FilterBarB2B } from './filterbarb2b';
import TicketTableTabs from './TicketTableTabs';
import TicketTableB2B from './TicketTableB2B';
import type { Ticket } from '@/app/types/ticket';

interface TicketTableItem {
  idTicket: number;
  ticket?: string;
  jenisTiket?: string | null;
  status_update?: string | null;
  status?: string | null;
  customerType?: string | null;
  ctype?: string | null;
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
  ticketIdGamas?: string | null;
  pendingDompis?: string | null;
  worklogSummary?: string | null;
  customerSegment?: string | null;
  [key: string]: unknown;
}

function mapTicketForTable(t: Ticket): TicketTableItem {
  return {
    idTicket: t.idTicket,
    ticket: t.ticket,
    jenisTiket: t.jenisTiket,
    status_update: normalizeStatusUpdate(t.status_update),
    status: t.status,
    customerType: t.customerType,
    ctype: t.ctype,
    flaggingManja: t.flaggingManja,
    guaranteeStatus: t.guaranteeStatus,
    ticketIdGamas: t.ticketIdGamas,
    pendingDompis: t.pendingDompis,
    worklogSummary: (t as Ticket & { worklogSummary?: string | null }).worklogSummary ?? null,
    customerSegment: t.customerSegment,
  };
}

function hasValidGamasTicketId(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim();
  return (
    normalized.length > 0 &&
    !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
      normalized.toLowerCase(),
    )
  );
}

interface B2BPanelProps {
  searchQuery: string;
  workzoneFilter: string;
  deptFilter: 'all' | 'b2b' | 'b2c';
  tickets: Ticket[];
  b2bSummaryFromApi?: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    ffgCount?: number;
    gamasCount?: number;
    p1Count?: number;
    pPlusCount?: number;
  };
  b2bGroupsFromApi?: Record<string, {
  total: number;
  open: number;
  assigned: number;
  close: number;
  ffgCount?: number;
  gamasCount?: number;
  p1Count?: number;
  pPlusCount?: number;
}>;
  onAssign: (ticketId: number | string) => void;
}

const B2BPanel = memo(function B2BPanel({
  searchQuery,
  workzoneFilter,
  deptFilter,
  tickets,
  b2bSummaryFromApi,
  b2bGroupsFromApi,
  onAssign,
}: B2BPanelProps) {
  const [b2bTicketTypeFilter, setB2bTicketTypeFilter] = useState<string[]>([]);
  const [b2bHasilVisitFilter, setB2bHasilVisitFilter] = useState<string[]>([]);
  const [b2bTicketStatusFilter, setB2bTicketStatusFilter] = useState<string[]>([]);
  const [b2bFlaggingFilter, setB2bFlaggingFilter] = useState<string[]>([]);
  const [b2bPage, setB2bPage] = useState(1);
  const [b2bValidasiPage, setB2bValidasiPage] = useState(1);
  const [b2bClosePage, setB2bClosePage] = useState(1);
  const b2bSectionRef = useRef<HTMLDivElement>(null);
  const b2bTableRef = useRef<HTMLDivElement>(null);

  const b2bPageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketType: b2bTicketTypeFilter,
    statusUpdate: b2bHasilVisitFilter,
    ticketStatus: b2bTicketStatusFilter,
    flagging: b2bFlaggingFilter,
    page: b2bPage,
    limit: 10,
    validasiPage: b2bValidasiPage,
    validasiLimit: 10,
  });

  const b2bClosePageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2b',
    ticketType: b2bTicketTypeFilter,
    statusUpdate: b2bHasilVisitFilter,
    ticketStatus: CLOSE_STATUS_VALUES,
    flagging: b2bFlaggingFilter,
    page: b2bClosePage,
    limit: 10,
    includeValidasi: false,
  });

  const handleB2bTicketTypeChange = useCallback((types: string[]) => {
    setB2bTicketTypeFilter(types);
    setB2bPage(1);
    setB2bValidasiPage(1);
    setB2bClosePage(1);
  }, []);

  const handleB2bTicketStatusChange = useCallback((statuses: string[]) => {
    setB2bTicketStatusFilter(statuses);
    setB2bPage(1);
    setB2bValidasiPage(1);
    setB2bClosePage(1);
  }, []);

  const handleB2bHasilVisitChange = useCallback((statuses: string[]) => {
    setB2bHasilVisitFilter(statuses);
    setB2bPage(1);
    setB2bValidasiPage(1);
    setB2bClosePage(1);
  }, []);

  const handleB2bFlaggingChange = useCallback((flags: string[]) => {
    setB2bFlaggingFilter(flags);
    setB2bPage(1);
    setB2bValidasiPage(1);
    setB2bClosePage(1);
  }, []);

  const b2bGroupedData = useMemo(() => {
    const b2bTickets = tickets.filter((t) => {
      const seg = (t.customerSegment ?? '').toUpperCase();
      const b2cSegments = ['DCS', 'PL-TSEL'];
      return !b2cSegments.includes(seg);
    });
    const groupMap = new Map<string, Ticket[]>();
    for (const t of b2bTickets) {
      const key = getB2BGroupKey(t.jenisTiket1);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(t);
    }
    return Array.from(groupMap.entries()).map(([groupKey, groupTickets]) => ({
      groupKey,
      tickets: groupTickets,
    }));
  }, [tickets]);

  const clientB2bSummary = useMemo(() => {
    const arr = tickets.filter((t) => {
      const seg = (t.customerSegment ?? '').toUpperCase();
      const b2cSegments = ['DCS', 'PL-TSEL'];
      return !b2cSegments.includes(seg);
    });
    return {
      total: arr.length,
      open: arr.filter((t) => isTicketOpenLike(t.status_update)).length,
      assigned: arr.filter((t) => isTicketInWork(t.status_update)).length,
      close: arr.filter((t) => isTicketClosed(t.status_update)).length,
      regulerCount: 0,
      sqmCount: 0,
      ffgCount: arr.filter((t) => String(t.guaranteeStatus ?? '').trim().toLowerCase() === 'guarantee').length,
      gamasCount: arr.filter((t) => hasValidGamasTicketId(t.ticketIdGamas)).length,
      p1Count: arr.filter((t) => t.flaggingManja === 'P1').length,
      pPlusCount: arr.filter((t) => t.flaggingManja === 'P+').length,
    };
  }, [tickets]);

  const b2bSectionSummary = useMemo(() => {
    const source = b2bSummaryFromApi ?? clientB2bSummary;
    return {
      total: b2bPageData.pagination.total,
      open: source.open,
      assigned: source.assigned,
      close: b2bClosePageData.pagination.total,
      regulerCount: 0,
      sqmCount: 0,
      ffgCount: source.ffgCount ?? 0,
      gamasCount: source.gamasCount ?? 0,
      p1Count: source.p1Count ?? 0,
      pPlusCount: source.pPlusCount ?? 0,
    };
  }, [
    b2bSummaryFromApi,
    clientB2bSummary,
    b2bPageData.pagination.total,
    b2bClosePageData.pagination.total,
  ]);

  const isValidationTicket = useCallback((t: TicketTableItem) => {
    const statusUpdate = (t.status_update ?? '').trim().toLowerCase();
    const status = (t.status ?? '').trim().toLowerCase();
    const worklogSummary = (t.worklogSummary ?? '').trim().toLowerCase();
    return status !== 'closed' && (statusUpdate === 'close' || worklogSummary === 'tech closed');
  }, []);

  const ticketTableData = useMemo(
    () => tickets.filter((t) => !isValidationTicket(t as unknown as TicketTableItem)).map(mapTicketForTable),
    [tickets],
  );

  const b2bTicketTableData = useMemo(() => ticketTableData
    .filter((t) => {
      const seg = (t.customerSegment ?? '').toUpperCase();
      const b2cSegments = ['DCS', 'PL-TSEL'];
      return !b2cSegments.includes(seg);
    })
    .filter((t) => {
      if (b2bTicketTypeFilter.length === 0) return true;
      return b2bTicketTypeFilter.includes(normalizeJenis(t.jenisTiket));
    })
    .filter((t) => {
      if (b2bHasilVisitFilter.length === 0) return true;
      if (b2bHasilVisitFilter.includes('close') && isTicketClosed(t.status_update)) return true;
      const status = normalizeStatusUpdate(t.status_update);
      return b2bHasilVisitFilter.some((f) => {
        if (f === 'close') return false;
        return status === f;
      });
    })
    .filter((t) => {
      if (b2bFlaggingFilter.length === 0) return true;
      return b2bFlaggingFilter.some((f) => {
        if (f === 'FFG') return String(t.guaranteeStatus ?? '').trim().toLowerCase() === 'guarantee';
        if (f === 'GAMAS') {
          const value = String(t.ticketIdGamas ?? '').trim();
          return value.length > 0 && !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(value.toLowerCase());
        }
        return t.flaggingManja === f;
      });
    })
    .filter((t) => {
      if (b2bTicketStatusFilter.length === 0) return true;
      return b2bTicketStatusFilter.includes(String(t.status ?? '').trim());
    }), [ticketTableData, b2bTicketTypeFilter, b2bHasilVisitFilter, b2bFlaggingFilter, b2bTicketStatusFilter]);

  const b2bTableSummary = useMemo(() => {
    const serverSummary = b2bPageData.summary;
    if (serverSummary) {
      return {
        total: serverSummary.total,
        open: serverSummary.open,
        assigned: serverSummary.assigned,
        close: serverSummary.close,
      };
    }

    const breakdown = {
      total: b2bTicketTableData.length,
      open: b2bTicketTableData.filter((t) => isTicketOpenLike(t.status_update)).length,
      assigned: b2bTicketTableData.filter((t) => isTicketInWork(t.status_update)).length,
      close: b2bTicketTableData.filter((t) => isTicketClosed(t.status_update)).length,
    };
    return { ...breakdown, total: b2bPageData.pagination.total };
  }, [b2bPageData.summary, b2bTicketTableData, b2bPageData.pagination.total]);

  return (
    <div ref={b2bSectionRef} className='flex flex-col gap-4 space-y-3 md:space-y-4'>
      <B2BSection
        groupedData={b2bGroupedData}
        groupSummaries={b2bGroupsFromApi}
        loading={b2bPageData.loading && !b2bPageData.isRefreshing}
        summary={b2bSectionSummary}
      />
      <FilterBarB2B
        ticketType={b2bTicketTypeFilter}
        statusUpdate={b2bHasilVisitFilter}
        ticketStatus={b2bTicketStatusFilter}
        ticketStatusOptions={b2bPageData.statusOptions}
        flagging={b2bFlaggingFilter}
        onTypeChange={handleB2bTicketTypeChange}
        onStatusChange={handleB2bHasilVisitChange}
        onTicketStatusChange={handleB2bTicketStatusChange}
        onFlaggingChange={handleB2bFlaggingChange}
      />
      <div id='admin-b2b-ticket-table' ref={b2bTableRef} className='scroll-mt-20'>
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
              searching={Boolean(searchQuery.trim())}
              onAssign={onAssign}
              downloadFilters={{
                dept: 'b2b',
                ticketType: b2bTicketTypeFilter,
                statusUpdate: b2bHasilVisitFilter,
                ticketStatus: b2bTicketStatusFilter,
                flagging: b2bFlaggingFilter,
              }}
              pagination={{
                currentPage: b2bPageData.pagination.currentPage,
                totalPages: b2bPageData.pagination.totalPages,
                total: b2bPageData.pagination.total,
                limit: b2bPageData.pagination.limit,
                onPageChange: setB2bPage,
              }}
            />
          }
          tickets={b2bPageData.tickets}
          validasiTickets={b2bPageData.validasiTickets}
          totalCount={b2bPageData.pagination.total}
          validasiTotalCount={b2bPageData.validasiCount}
          closeCount={b2bClosePageData.pagination.total}
          validasiPagination={{
            currentPage: b2bPageData.validasiPagination.currentPage,
            totalPages: b2bPageData.validasiPagination.totalPages,
            total: b2bPageData.validasiPagination.total,
            limit: b2bPageData.validasiPagination.limit,
            onPageChange: setB2bValidasiPage,
          }}
          closeTable={
            <TicketTableB2B
              tickets={b2bClosePageData.tickets}
              tableSummary={b2bClosePageData.summary}
              flaggingFilter={b2bFlaggingFilter}
              loading={b2bClosePageData.loading}
              isRefreshing={b2bClosePageData.isRefreshing}
              searching={Boolean(searchQuery.trim())}
              onAssign={onAssign}
              downloadFilters={{
                dept: 'b2b',
                ticketType: b2bTicketTypeFilter,
                statusUpdate: b2bHasilVisitFilter,
                ticketStatus: CLOSE_STATUS_VALUES,
                flagging: b2bFlaggingFilter,
              }}
              pagination={{
                currentPage: b2bClosePageData.pagination.currentPage,
                totalPages: b2bClosePageData.pagination.totalPages,
                total: b2bClosePageData.pagination.total,
                limit: b2bClosePageData.pagination.limit,
                onPageChange: setB2bClosePage,
              }}
            />
          }
          loading={b2bPageData.loading}
          isRefreshing={b2bPageData.isRefreshing}
          onAssign={onAssign}
        />
      </div>
    </div>
  );
});

export default B2BPanel;
