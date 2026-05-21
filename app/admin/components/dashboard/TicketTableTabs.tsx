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
  section: 'b2c' | 'b2b';
  accentColor: string;
  mainTable: ReactNode;
  tickets: TicketTableRow[];
  totalCount?: number;
  validasiTotalCount?: number;
  loading?: boolean;
  isRefreshing?: boolean;
  onAssign?: (ticketId: number | string) => void;
}

export default function TicketTableTabs({
  section,
  accentColor,
  mainTable,
  tickets,
  totalCount,
  validasiTotalCount,
  loading,
  isRefreshing,
  onAssign,
}: TicketTableTabsProps) {
  const STORAGE_KEY = `admin:tab:${section}`;

  const [activeTab, setActiveTab] = useState<'main' | 'validasi'>('main');
  const [mounted, setMounted] = useState(false);

  // Hydration-safe localStorage read
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'validasi') {
        setActiveTab(saved);
      }
    } catch {
      // ignore
    }
  }, [STORAGE_KEY]);

  // Persist tab selection
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab, STORAGE_KEY, mounted]);

  // Filter tickets for validasi tab
  // Syarat: status_update = 'close' dan status != 'closed'
  // Termasuk tiket dengan status = 'BACKEND' yang belum benar-benar closed
  const validasiTickets = useMemo(() => {
    return tickets.filter((t) => {
      const statusUpdate = (t.status_update ?? t.statusUpdate ?? '')
        .trim()
        .toLowerCase();
      const status = (t.status ?? '').trim().toLowerCase();
      return statusUpdate === 'close' && status !== 'closed';
    });
  }, [tickets]);

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
  ];

  return (
    <div className='space-y-3'>
      {/* Tab bar */}
      <div className='flex items-center gap-2'>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type='button'
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200',
                isActive
                  ? 'text-white shadow-md'
                  : 'bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface)',
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
      <div className='relative min-h-50'>
        {activeTab === 'main' && (
          <div className='animate-in fade-in duration-200'>{mainTable}</div>
        )}
        {activeTab === 'validasi' && (
          <div className='animate-in fade-in duration-200'>
            <TicketTableValidasi
              tickets={validasiTickets}
              loading={loading}
              isRefreshing={isRefreshing}
            />
          </div>
        )}
      </div>
    </div>
  );
}
