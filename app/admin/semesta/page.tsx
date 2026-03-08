'use client';

import { useCallback, useState, useMemo } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import TicketTableSemesta from '@/app/admin/components/dashboard/TicketTableSemesta';
import { useSemestaTickets } from '@/app/hooks/useSemestaTickets';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { useTicketStats } from '@/app/hooks/useTicketStats';
import { TicketCtype, Ticket } from '@/app/types/ticket';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X, ChevronDown, ChevronRight } from 'lucide-react';

type Dept = 'all' | 'b2b' | 'b2c';
type TicketType = 'all' | 'reguler' | 'sqm' | 'unspec';
type StatusFilter =
  | 'all'
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'escalated'
  | 'closed';

const DEPT_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'b2b', label: 'B2B' },
  { key: 'b2c', label: 'B2C' },
];

const CTYPE_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'REGULER', label: 'Reguler' },
  { key: 'HVC_GOLD', label: 'HVC Gold' },
  { key: 'HVC_PLATINUM', label: 'HVC Platinum' },
  { key: 'HVC_DIAMOND', label: 'HVC Diamond' },
  { key: 'datin_k1', label: 'DATIN K1' },
  { key: 'datin_k1k2', label: 'DATIN K1K2' },
  { key: 'datin_k3', label: 'DATIN K3' },
  { key: 'indibiz_4', label: 'Indibiz 4' },
  { key: 'indibiz_24', label: 'Indibiz 24' },
  { key: 'reseller_6', label: 'Reseller 6' },
  { key: 'reseller_36', label: 'Reseller 36' },
  { key: 'wifi_24', label: 'WiFi 24' },
];

const TYPE_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'reguler', label: 'Reguler' },
  { key: 'sqm', label: 'SQM' },
  { key: 'unspec', label: 'Unspec' },
];

const STATUS_OPTIONS = [
  { key: 'all', label: 'Semua Status' },
  { key: 'OPEN', label: 'Open' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'ON_PROGRESS', label: 'On Progress' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'ESCALATED', label: 'Escalated' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'CLOSE', label: 'Closed' },
];

const B2C_TYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];
const B2B_TYPES = [
  'datin_k1',
  'datin_k1k2',
  'datin_k3',
  'indibiz_4',
  'indibiz_24',
  'reseller_6',
  'reseller_36',
  'wifi_24',
];

function Dropdown({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className='w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
        {label}
      </span>
      <div className='relative'>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'bg-surface-2 appearance-none rounded-lg border border-(--border) px-4 py-2 pr-8 text-xs font-semibold text-(--text-primary)',
            'cursor-pointer transition-all duration-150',
            'hover:border-blue-400/40 focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/20 focus:outline-none',
          )}
        >
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className='pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-secondary)' />
      </div>
    </div>
  );
}

function CustomerTypeStats({
  byCustomerType,
}: {
  byCustomerType: { ctype: string; total: number }[];
}) {
  const [openB2C, setOpenB2C] = useState(true);
  const [openB2B, setOpenB2B] = useState(true);

  const b2cData = useMemo(() => {
    return B2C_TYPES.map((type) => {
      const found = byCustomerType.find((c) => c.ctype === type);
      return {
        label: type.replace('HVC_', 'HVC '),
        total: found?.total || 0,
      };
    });
  }, [byCustomerType]);

  const b2bData = useMemo(() => {
    return B2B_TYPES.map((type) => {
      const found = byCustomerType.find((c) => c.ctype === type);
      const labelMap: Record<string, string> = {
        datin_k1: 'DATIN K1',
        datin_k1k2: 'DATIN K1K2',
        datin_k3: 'DATIN K3',
        indibiz_4: 'Indibiz 4',
        indibiz_24: 'Indibiz 24',
        reseller_6: 'Reseller 6',
        reseller_36: 'Reseller 36',
        wifi_24: 'WiFi 24',
      };
      return {
        label: labelMap[type] || type,
        total: found?.total || 0,
      };
    });
  }, [byCustomerType]);

  const b2cTotal = b2cData.reduce((a, b) => a + b.total, 0);
  const b2bTotal = b2bData.reduce((a, b) => a + b.total, 0);

  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
      <div className='bg-surface overflow-hidden rounded-xl border border-(--border)'>
        <button
          onClick={() => setOpenB2C(!openB2C)}
          className='flex w-full items-center justify-between bg-violet-500/10 px-4 py-3 transition-colors hover:bg-violet-500/15'
        >
          <div className='flex items-center gap-2'>
            <span className='h-2 w-2 rounded-full bg-violet-400' />
            <span className='text-sm font-bold text-violet-400'>B2C</span>
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-sm font-bold text-violet-400'>
              {b2cTotal}
            </span>
            {openB2C ? (
              <ChevronDown className='h-4 w-4 text-violet-400' />
            ) : (
              <ChevronRight className='h-4 w-4 text-violet-400' />
            )}
          </div>
        </button>
        {openB2C && (
          <div className='divide-y divide-(--border)'>
            {b2cData.map((item, idx) => (
              <div
                key={idx}
                className='hover:bg-surface-2 flex items-center justify-between px-4 py-2 transition-colors'
              >
                <span className='text-xs text-(--text-secondary)'>
                  {item.label}
                </span>
                <span className='text-sm font-bold text-(--text-primary)'>
                  {item.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='bg-surface overflow-hidden rounded-xl border border-(--border)'>
        <button
          onClick={() => setOpenB2B(!openB2B)}
          className='flex w-full items-center justify-between bg-blue-500/10 px-4 py-3 transition-colors hover:bg-blue-500/15'
        >
          <div className='flex items-center gap-2'>
            <span className='h-2 w-2 rounded-full bg-blue-400' />
            <span className='text-sm font-bold text-blue-400'>B2B</span>
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-sm font-bold text-blue-400'>{b2bTotal}</span>
            {openB2B ? (
              <ChevronDown className='h-4 w-4 text-blue-400' />
            ) : (
              <ChevronRight className='h-4 w-4 text-blue-400' />
            )}
          </div>
        </button>
        {openB2B && (
          <div className='divide-y divide-(--border)'>
            {b2bData.map((item, idx) => (
              <div
                key={idx}
                className='hover:bg-surface-2 flex items-center justify-between px-4 py-2 transition-colors'
              >
                <span className='text-xs text-(--text-secondary)'>
                  {item.label}
                </span>
                <span className='text-sm font-bold text-(--text-primary)'>
                  {item.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SemestaPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ctypeFilter, setCtypeFilter] = useState<TicketCtype | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'b2b' | 'b2c'>('all');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<
    | 'all'
    | 'reguler'
    | 'sqm'
    | 'hvc'
    | 'unspec'
    | 'sqm-ccan'
    | 'indibiz'
    | 'datin'
    | 'reseller'
    | 'wifi-id'
  >('all');
  const [hasilVisitFilter, setHasilVisitFilter] = useState<
    | 'all'
    | 'open'
    | 'assigned'
    | 'on_progress'
    | 'pending'
    | 'escalated'
    | 'closed'
  >('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const { options: workzoneOptions, loading: workzoneLoading } =
    useWorkzoneOptions();

  const {
    tickets,
    loading: ticketsLoading,
    pagination,
  } = useSemestaTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
    ctypeFilter !== 'all' ? ctypeFilter : undefined,
    hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
    deptFilter !== 'all' ? deptFilter : undefined,
    ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
    startDate || undefined,
    endDate || undefined,
  );

  const { data: statsApi } = useTicketStats(workzoneFilter || undefined, {
    dept: deptFilter,
    ticketType: ticketTypeFilter,
    statusUpdate: hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
  });

  const byCustomerType = useMemo(() => {
    return (statsApi?.byCustomerType ?? []).map((row) => ({
      ctype: row.ctype,
      total: Number(row.total || 0),
    }));
  }, [statsApi]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setCurrentPage(1);
  }, []);

  const handleDeptChange = (dept: string) => {
    setDeptFilter(dept as 'all' | 'b2b' | 'b2c');
    setCurrentPage(1);
  };

  const handleTicketTypeChange = (type: string) => {
    setTicketTypeFilter(
      type as
        | 'all'
        | 'reguler'
        | 'sqm'
        | 'hvc'
        | 'unspec'
        | 'sqm-ccan'
        | 'indibiz'
        | 'datin'
        | 'reseller'
        | 'wifi-id',
    );
    setCurrentPage(1);
  };

  const handleHasilVisitChange = (status: string) => {
    setHasilVisitFilter(status as StatusFilter);
    setCurrentPage(1);
  };

  const handleCtypeChange = (ctype: string) => {
    setCtypeFilter(ctype as TicketCtype | 'all');
    setCurrentPage(1);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    setCurrentPage(1);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setWorkzoneFilter('');
    setCtypeFilter('all');
    setDeptFilter('all');
    setTicketTypeFilter('all');
    setHasilVisitFilter('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const activeFilterCount =
    (deptFilter !== 'all' ? 1 : 0) +
    (ticketTypeFilter !== 'all' ? 1 : 0) +
    (hasilVisitFilter !== 'all' ? 1 : 0) +
    (ctypeFilter !== 'all' ? 1 : 0) +
    (workzoneFilter ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const ticketTableData = tickets.map((t) => ({
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
    hasilVisit: t.hasilVisit,
    closedAt: t.closedAt,
    reportedDate: t.reportedDate,
    status: t.status,
    maxTtrReguler: t.maxTtrReguler,
    maxTtrGold: t.maxTtrGold,
    maxTtrPlatinum: t.maxTtrPlatinum,
    maxTtrDiamond: t.maxTtrDiamond,
  }));

  return (
    <AdminLayout
      onSearch={handleSearch}
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzoneFilter}
    >
      <div className='flex flex-col gap-6'>
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
          <div className='bg-surface-2 flex items-center justify-between px-4 py-3 md:px-5 md:py-3.5'>
            <div>
              <div className='text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
                Database Tiket - Semesta
              </div>
              <div className='mt-1 text-[10px] text-(--text-muted)'>
                Total {pagination.total.toLocaleString()} ticket
              </div>
            </div>
            <div className='text-2xl font-bold text-(--text-primary)'>
              {pagination.total.toLocaleString()}
            </div>
          </div>
        </div>

        <CustomerTypeStats byCustomerType={byCustomerType} />

        <div className='space-y-2'>
          <div className='flex items-center justify-between lg:hidden'>
            <button
              onClick={() => setShowMobileFilters((v) => !v)}
              className='bg-surface flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400'
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className='rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white'>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className='flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-500'
              >
                <X size={12} /> Reset
              </button>
            )}
          </div>

          <div
            className={cn(
              'flex-col gap-3',
              showMobileFilters ? 'flex' : 'hidden lg:flex',
              'bg-surface overflow-hidden rounded-xl border border-(--border) p-4 shadow-sm',
            )}
          >
            <div className='flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center'>
              <div className='flex items-center gap-2'>
                <span className='w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
                  Tanggal
                </span>
                <div className='flex items-center gap-2'>
                  <input
                    type='date'
                    value={startDate}
                    onChange={handleStartDateChange}
                    className='bg-surface w-36 cursor-pointer rounded-lg border border-(--border) px-3 py-2 text-xs font-semibold text-(--text-primary) hover:border-blue-400/40 focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/20 focus:outline-none'
                    style={
                      { WebkitAppearance: 'menulist' } as React.CSSProperties
                    }
                  />
                  <span className='text-(--text-secondary)'>-</span>
                  <input
                    type='date'
                    value={endDate}
                    onChange={handleEndDateChange}
                    className='bg-surface w-36 cursor-pointer rounded-lg border border-(--border) px-3 py-2 text-xs font-semibold text-(--text-primary) hover:border-blue-400/40 focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/20 focus:outline-none'
                    style={
                      { WebkitAppearance: 'menulist' } as React.CSSProperties
                    }
                  />
                </div>
              </div>

              <Dropdown
                label='Dept'
                value={deptFilter}
                options={DEPT_OPTIONS}
                onChange={handleDeptChange}
              />

              <Dropdown
                label='Jenis'
                value={ticketTypeFilter}
                options={TYPE_OPTIONS}
                onChange={handleTicketTypeChange}
              />

              <Dropdown
                label='Status'
                value={hasilVisitFilter}
                options={STATUS_OPTIONS}
                onChange={handleHasilVisitChange}
              />

              <Dropdown
                label='Customer'
                value={ctypeFilter}
                options={CTYPE_OPTIONS}
                onChange={handleCtypeChange}
              />

              {activeFilterCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-400/10',
                    'lg:ml-auto',
                  )}
                >
                  <X size={12} />
                  Reset
                  <span className='rounded-full bg-red-400/20 px-1.5 py-0.5 text-[9px] font-bold'>
                    {activeFilterCount}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <TicketTableSemesta
          tickets={ticketTableData}
          loading={ticketsLoading}
          pagination={{
            currentPage: pagination.currentPage,
            totalPages: pagination.totalPages,
            total: pagination.total,
            limit: pagination.limit,
            onPageChange: setCurrentPage,
          }}
        />
      </div>
    </AdminLayout>
  );
}
