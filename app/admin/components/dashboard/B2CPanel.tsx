'use client';

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import {
  CLOSE_STATUS_VALUES,
  isTicketClosed,
  isTicketInWork,
  isTicketOpenLike,
  normalizeStatusUpdate,
} from '@/app/libs/ticket-utils';
import { getEffectiveFlaggingLabel } from '@/app/libs/tickets/effective';
import B2CSection from './B2CSection';
import { FilterBarB2C } from './filterbarb2c';
import TicketTableTabs from './TicketTableTabs';
import TicketTable from './TicketTable';
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

interface B2CPanelProps {
  searchQuery: string;
  workzoneFilter: string;
  deptFilter: 'all' | 'b2b' | 'b2c';
  ctypeFilter: string;
  tickets: Ticket[];
  b2cStatsFromApi?: {
    summary: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      gamasCount: number;
      p1Count: number;
      pPlusCount: number;
    };
    reguler: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      gamasCount: number;
      p1Count: number;
      pPlusCount: number;
    };
    hvcGold: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      gamasCount: number;
      p1Count: number;
      pPlusCount: number;
    };
    hvcPlatinum: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      gamasCount: number;
      p1Count: number;
      pPlusCount: number;
    };
    hvcDiamond: {
      total: number;
      open: number;
      assigned: number;
      close: number;
      customerCount: number;
      sqmCount: number;
      unspecCount: number;
      ffgCount: number;
      gamasCount: number;
      p1Count: number;
      pPlusCount: number;
    };
  };
  onAssign: (ticketId: number | string) => void;
  onSelectType: (ctype: string) => void;
}

function getB2CSummaryBucket(jenis?: string | null): 'customer' | 'sqm' | 'unspec' {
  const normalized = normalizeJenis(jenis);
  if (!normalized || normalized === 'reguler' || normalized === 'hvc') return 'customer';
  if (normalized === 'sqm') return 'sqm';
  return 'unspec';
}

function isB2CSegmentTicket(ticket: Ticket): boolean {
  const seg = (ticket.customerSegment ?? '').toUpperCase();
  return ['DCS', 'PL-TSEL'].includes(seg);
}

const B2CPanel = memo(function B2CPanel({
  searchQuery,
  workzoneFilter,
  deptFilter,
  ctypeFilter,
  tickets,
  b2cStatsFromApi,
  onAssign,
  onSelectType,
}: B2CPanelProps) {
  const [b2cTicketTypeFilter, setB2cTicketTypeFilter] = useState<string[]>([]);
  const [b2cHasilVisitFilter, setB2cHasilVisitFilter] = useState<string[]>([]);
  const [b2cTicketStatusFilter, setB2cTicketStatusFilter] = useState<string[]>([]);
  const [b2cFlaggingFilter, setB2cFlaggingFilter] = useState<string[]>([]);
  const [b2cPage, setB2cPage] = useState(1);
  const [b2cValidasiPage, setB2cValidasiPage] = useState(1);
  const [b2cClosePage, setB2cClosePage] = useState(1);
  const [b2cSortField, setB2cSortField] = useState<string | undefined>(undefined);
  const [b2cSortOrder, setB2cSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<'main' | 'validasi' | 'close'>(
    'main',
  );
  const b2cSectionRef = useRef<HTMLDivElement>(null);
  const b2cTableRef = useRef<HTMLDivElement>(null);

  const b2cPageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2c',
    ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
    ticketType: b2cTicketTypeFilter,
    statusUpdate: b2cHasilVisitFilter,
    ticketStatus: b2cTicketStatusFilter,
    flagging: b2cFlaggingFilter,
    page: b2cPage,
    limit: 10,
    validasiPage: b2cValidasiPage,
    validasiLimit: 10,
    includeValidasiTickets: activeTab === 'validasi',
    sortField: b2cSortField,
    sortOrder: b2cSortOrder,
  });

  const b2cClosePageData = useDailyTicketPage({
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    dept: 'b2c',
    ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
    ticketType: b2cTicketTypeFilter,
    statusUpdate: b2cHasilVisitFilter,
    ticketStatus: CLOSE_STATUS_VALUES,
    flagging: b2cFlaggingFilter,
    page: b2cClosePage,
    limit: 10,
    includeValidasi: false,
    includeOptions: false,
    enabled: activeTab === 'close',
  });

  const handleB2cTicketTypeChange = useCallback((types: string[]) => {
    setB2cTicketTypeFilter(types);
    setB2cPage(1);
    setB2cValidasiPage(1);
    setB2cClosePage(1);
  }, []);

  const handleB2cTicketStatusChange = useCallback((statuses: string[]) => {
    setB2cTicketStatusFilter(statuses);
    setB2cPage(1);
    setB2cValidasiPage(1);
    setB2cClosePage(1);
  }, []);

  const handleB2cHasilVisitChange = useCallback((statuses: string[]) => {
    setB2cHasilVisitFilter(statuses);
    setB2cPage(1);
    setB2cValidasiPage(1);
    setB2cClosePage(1);
  }, []);

  const handleB2cFlaggingChange = useCallback((flags: string[]) => {
    setB2cFlaggingFilter(flags);
    setB2cPage(1);
    setB2cValidasiPage(1);
    setB2cClosePage(1);
  }, []);

  const handleB2cSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setB2cSortField(field);
    setB2cSortOrder(order);
    setB2cPage(1);
  }, []);

  const b2cBaseTickets = useMemo(
    () => tickets.filter(isB2CSegmentTicket),
    [tickets],
  );

  const b2cTicketTableData = useMemo(() => {
    const rows: TicketTableItem[] = [];
    for (const ticket of b2cBaseTickets) {
      if (ctypeFilter !== 'all') {
        const ct = (ticket.ctype || ticket.customerType || '').toUpperCase();
        if (ct !== ctypeFilter) continue;
      }

      if (b2cTicketTypeFilter.length > 0) {
        const rawJenis = String(ticket.jenisTiket ?? '').trim();
        const hasTypeMatch = b2cTicketTypeFilter.some((filter) => {
          const rawFilter = String(filter ?? '').trim();
          return rawJenis === rawFilter || normalizeJenis(rawJenis) === normalizeJenis(rawFilter);
        });
        if (!hasTypeMatch) continue;
      }

      if (b2cHasilVisitFilter.length > 0) {
        const status = normalizeStatusUpdate(ticket.status_update);
        const hasVisitMatch = b2cHasilVisitFilter.some((f) => {
          if (f === 'close') return isTicketClosed(status);
          return status === f;
        });
        if (!hasVisitMatch) continue;
      }

      if (b2cFlaggingFilter.length > 0) {
        const hasFlagMatch = b2cFlaggingFilter.some((f) => {
          if (f === 'FFG') {
            return String(ticket.guaranteeStatus ?? '').trim().toLowerCase() === 'guarantee';
          }
          if (f === 'GAMAS') {
            const value = String(ticket.ticketIdGamas ?? '').trim();
            return value.length > 0 && !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(value.toLowerCase());
          }
          return getEffectiveFlaggingLabel(ticket) === f;
        });
        if (!hasFlagMatch) continue;
      }

      if (b2cTicketStatusFilter.length > 0) {
        const status = String(ticket.status ?? '').trim();
        if (!b2cTicketStatusFilter.includes(status)) continue;
      }

      rows.push(mapTicketForTable(ticket));
    }
    return rows;
  }, [
    b2cBaseTickets,
    ctypeFilter,
    b2cTicketTypeFilter,
    b2cHasilVisitFilter,
    b2cFlaggingFilter,
    b2cTicketStatusFilter,
  ]);

  const b2cTableSummary = useMemo(() => {
    const serverSummary = b2cPageData.summary;
    if (serverSummary) {
      return {
        total: serverSummary.total,
        open: serverSummary.open,
        assigned: serverSummary.assigned,
        close: serverSummary.close,
      };
    }

    let open = 0;
    let assigned = 0;
    let close = 0;
    for (const ticket of b2cTicketTableData) {
      if (isTicketClosed(ticket.status_update)) close++;
      else if (isTicketInWork(ticket.status_update)) assigned++;
      else if (isTicketOpenLike(ticket.status_update)) open++;
    }
    return {
      total: b2cPageData.pagination.total,
      open,
      assigned,
      close,
    };
  }, [b2cPageData.summary, b2cTicketTableData, b2cPageData.pagination.total]);

  const b2cDailySummary = useMemo(() => {
    const summary = {
      total: b2cBaseTickets.length, open: 0, assigned: 0, close: 0,
      gamasCount: 0, customerCount: 0, sqmCount: 0, unspecCount: 0,
      ffgCount: 0, p1Count: 0, pPlusCount: 0,
    };
    for (const t of b2cBaseTickets) {
      if (isTicketClosed(t.status_update)) summary.close++;
      else if (isTicketInWork(t.status_update)) summary.assigned++;
      else summary.open++;
      const jenisBucket = getB2CSummaryBucket(t.jenisTiket);
      if (jenisBucket === 'customer') summary.customerCount++;
      else if (jenisBucket === 'sqm') summary.sqmCount++;
      else summary.unspecCount++;
      const candidates = [t.ticketIdGamas, (t as any).ticket_id_gamas, (t as any).TICKET_ID_GAMAS];
      const raw = candidates.find((v) => v !== null && v !== undefined);
      const normalized = String(raw ?? '').trim();
      if (normalized && !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(normalized.toLowerCase())) summary.gamasCount++;
      if (t.guaranteeStatus?.toLowerCase() === 'guarantee') summary.ffgCount++;
      const flag = getEffectiveFlaggingLabel(t);
      if (flag === 'P1') summary.p1Count++;
      if (flag === 'P+') summary.pPlusCount++;
    }
    return summary;
  }, [b2cBaseTickets]);

  const b2cSectionData = useMemo(() => {
    if (b2cStatsFromApi) {
      return {
        ...b2cStatsFromApi,
        summary: {
          ...b2cStatsFromApi.summary,
          total: b2cPageData.pagination.total,
          close: b2cClosePageData.pagination.total,
        },
      };
    }

    return {
      summary: {
        ...b2cDailySummary,
        total: b2cPageData.pagination.total,
        close: b2cClosePageData.pagination.total,
      },
      reguler: { total: 0, open: 0, assigned: 0, close: 0, customerCount: 0, sqmCount: 0, unspecCount: 0, ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 },
      hvcGold: { total: 0, open: 0, assigned: 0, close: 0, customerCount: 0, sqmCount: 0, unspecCount: 0, ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 },
      hvcPlatinum: { total: 0, open: 0, assigned: 0, close: 0, customerCount: 0, sqmCount: 0, unspecCount: 0, ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 },
      hvcDiamond: { total: 0, open: 0, assigned: 0, close: 0, customerCount: 0, sqmCount: 0, unspecCount: 0, ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 },
    };
  }, [
    b2cStatsFromApi,
    b2cDailySummary,
    b2cPageData.pagination.total,
    b2cClosePageData.pagination.total,
  ]);

  return (
    <div ref={b2cSectionRef} className='flex flex-col gap-4 space-y-3 md:space-y-4'>
      <B2CSection
        data={b2cSectionData}
        activeType={ctypeFilter}
        onSelectType={onSelectType}
        loading={b2cPageData.loading && !b2cPageData.isRefreshing}
      />
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
      <div id='admin-b2c-ticket-table' ref={b2cTableRef} className='scroll-mt-20'>
        <TicketTableTabs
          section='b2c'
          accentColor='#10b981'
          onTabChange={setActiveTab}
          mainTable={
            <TicketTable
              tickets={b2cPageData.tickets}
              tableSummary={b2cTableSummary}
              flaggingFilter={b2cFlaggingFilter}
              loading={b2cPageData.loading}
              isRefreshing={b2cPageData.isRefreshing}
              searching={Boolean(searchQuery.trim())}
              onAssign={onAssign}
              downloadFilters={{
                dept: 'b2c',
                ticketType: b2cTicketTypeFilter,
                statusUpdate: b2cHasilVisitFilter,
                ticketStatus: b2cTicketStatusFilter,
                flagging: b2cFlaggingFilter,
              }}
              pagination={{
                currentPage: b2cPageData.pagination.currentPage,
                totalPages: b2cPageData.pagination.totalPages,
                total: b2cPageData.pagination.total,
                limit: b2cPageData.pagination.limit,
                onPageChange: setB2cPage,
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
          closeCount={b2cClosePageData.pagination.total}
          validasiPagination={{
            currentPage: b2cPageData.validasiPagination.currentPage,
            totalPages: b2cPageData.validasiPagination.totalPages,
            total: b2cPageData.validasiPagination.total,
            limit: b2cPageData.validasiPagination.limit,
            onPageChange: setB2cValidasiPage,
          }}
          closeTable={
            <TicketTable
              tickets={b2cClosePageData.tickets}
              tableSummary={b2cClosePageData.summary}
              flaggingFilter={b2cFlaggingFilter}
              loading={b2cClosePageData.loading}
              isRefreshing={b2cClosePageData.isRefreshing}
              searching={Boolean(searchQuery.trim())}
              onAssign={onAssign}
              downloadFilters={{
                dept: 'b2c',
                ticketType: b2cTicketTypeFilter,
                statusUpdate: b2cHasilVisitFilter,
                ticketStatus: CLOSE_STATUS_VALUES,
                flagging: b2cFlaggingFilter,
              }}
              pagination={{
                currentPage: b2cClosePageData.pagination.currentPage,
                totalPages: b2cClosePageData.pagination.totalPages,
                total: b2cClosePageData.pagination.total,
                limit: b2cClosePageData.pagination.limit,
                onPageChange: setB2cClosePage,
              }}
              sortField={b2cSortField as any}
              sortOrder={b2cSortOrder}
              onSort={handleB2cSort}
            />
          }
          loading={b2cPageData.loading}
          isRefreshing={b2cPageData.isRefreshing}
          onAssign={onAssign}
        />
      </div>
    </div>
  );
});

export default B2CPanel;
