'use client';

import { useState, useEffect, useMemo, ReactNode } from 'react';
import clsx from 'clsx';
import TicketTableValidasi from './TicketTableValidasi';

interface TicketTableRow {
  idTicket?: number;
  ticket?: string;
  serviceNo?: string;
  ticketIdGamas?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  alamat?: string | null;
  bookingDate?: string | null;
  ctype?: string;
  customerType?: string;
  summary?: string;
  jenisTiket?: string;
  workzone?: string;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  hasilVisit?: string | null;
  statusUpdate?: string | null;
  status_update?: string | null;
  status?: string;
  worklogSummary?: string | null;
  closedAt?: string | null;
  reportedDate?: string | null;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
}

interface TicketTableTabsProps {
  section: string;
  accentColor: string;
  mainTable: ReactNode;
  closeTable?: ReactNode;
  tickets: TicketTableRow[];
  validasiTickets?: TicketTableRow[];
  totalCount?: number;
  closeCount?: number;
  validasiTotalCount?: number;
  validasiPagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  isRefreshing?: boolean;
  searching?: boolean;
  onAssign?: (ticketId: number | string) => void;
  forceMainTabKey?: string;
  onTabChange?: (tab: 'main' | 'validasi' | 'close') => void;
}

export default function TicketTableTabs({
  section,
  accentColor,
  mainTable,
  closeTable,
  tickets,
  validasiTickets = [],
  totalCount,
  closeCount,
  validasiTotalCount,
  validasiPagination,
  loading,
  isRefreshing,
  searching,
  onAssign,
  forceMainTabKey,
  onTabChange,
}: TicketTableTabsProps) {
  const STORAGE_KEY = `admin:tab:${section}`;

  const [activeTab, setActiveTab] = useState<'main' | 'validasi' | 'close'>(
    'main',
  );
  const [mounted, setMounted] = useState(false);

  // Hydration-safe localStorage read
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'validasi') {
        setActiveTab(saved);
      } else if (saved === 'close' && closeTable) {
        setActiveTab(saved);
      }
    } catch {
      // ignore
    }
  }, [STORAGE_KEY, closeTable]);

  // Persist tab selection
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, activeTab);
    } catch {
      // ignore
    }
    onTabChange?.(activeTab);
  }, [activeTab, STORAGE_KEY, mounted]);

  useEffect(() => {
    if (!forceMainTabKey?.trim()) return;
    setActiveTab('main');
  }, [forceMainTabKey]);

  useEffect(() => {
    if (activeTab !== 'close' || closeTable) return;
    setActiveTab('main');
  }, [activeTab, closeTable]);

  // Validasi tickets are fetched server-side with their own WHERE clause.
  // Condition: (status_update = 'close' OR worklog_summary = 'Tech Closed') AND status != 'closed'
  // (no longer filtered client-side — avoid pagination mismatch)

  const tabs = [
    {
      key: 'main' as const,
      label: 'Tabel Main',
      count: totalCount ?? tickets.length,
    },
    {
      key: 'validasi' as const,
      label: 'Tabel Validasi',
      count: validasiTotalCount ?? validasiTickets.length,
    },
    ...(closeTable
      ? [
          {
            key: 'close' as const,
            label: 'Close',
            count: closeCount ?? 0,
          },
        ]
      : []),
  ];

  return (
    <div className='space-y-4'>
      {/* Tab bar */}
      <div className='flex items-center gap-2 overflow-x-auto rounded-2xl border border-(--border) bg-(--surface) p-2 [-webkit-overflow-scrolling:touch]'>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type='button'
              onClick={() => {
                setActiveTab(tab.key);
                onTabChange?.(tab.key);
              }}
              className={clsx(
                'flex min-w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200',
                isActive
                  ? 'text-white shadow-md'
                  : 'bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface-3)',
              )}
              style={isActive ? { backgroundColor: accentColor } : undefined}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    isActive
                      ? 'bg-white/25 text-white'
                      : 'bg-(--border) text-(--text-secondary)',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content with fade transition */}
      <div className='relative min-h-64 pt-1'>
        {activeTab === 'main' && (
          <div className='animate-in fade-in duration-200'>{mainTable}</div>
        )}
        {activeTab === 'validasi' && (
          <div className='animate-in fade-in duration-200'>
            <TicketTableValidasi
              tickets={validasiTickets}
              pagination={validasiPagination}
              loading={loading}
              isRefreshing={isRefreshing}
              searching={searching}
            />
          </div>
        )}
        {activeTab === 'close' && closeTable && (
          <div className='animate-in fade-in duration-200'>{closeTable}</div>
        )}
      </div>
    </div>
  );
}
