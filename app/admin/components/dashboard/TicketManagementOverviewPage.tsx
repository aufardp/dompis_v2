'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useTicketManagementOverview } from '@/app/hooks/useTicketManagementOverview';
import {
  TICKET_MANAGEMENT_BUCKET_ITEMS,
  TICKET_MANAGEMENT_OVERVIEW_ITEMS,
} from '@/app/config/ticket-management-nav';
import HourlyChart from './HourlyChart';
import SymptomChart from './SymptomChart';

const CARD_TONES: Record<string, string> = {
  overview:
    'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-100',
  'kpi-customer':
    'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-100',
  'kpi-proactive':
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-100',
  'non-kpi-unspec':
    'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-100',
  'non-technical':
    'bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-500/10 dark:border-purple-500/20 dark:text-purple-100',
  'sqm-update':
    'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-100',
  obsolete:
    'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-100',
};

type FlaggingCounts = {
  p1Count?: number;
  pPlusCount?: number;
  ffgCount?: number;
  gamasCount?: number;
};

function FlaggingMiniGrid({ counts }: { counts?: FlaggingCounts }) {
  const items = [
    ['P1', counts?.p1Count ?? 0],
    ['P+', counts?.pPlusCount ?? 0],
    ['FFG', counts?.ffgCount ?? 0],
    ['GAMAS', counts?.gamasCount ?? 0],
  ] as const;

  return (
    <div className='grid grid-cols-4 gap-2 text-center'>
      {items.map(([label, value]) => (
        <div
          key={label}
          className='rounded-xl bg-white/55 px-2 py-2 dark:bg-black/10'
        >
          <p className='text-[9px] font-bold tracking-[1px] uppercase opacity-70'>
            {label}
          </p>
          <p className='mt-1 text-sm font-black'>
            {Number(value).toLocaleString('id-ID')}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function TicketManagementOverviewPage() {
  const [workzone, setWorkzone] = useState('');
  const { data, isLoading } = useTicketManagementOverview(
    true,
    workzone || undefined,
  );

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzone(value);
  }, []);

  const cardData = [
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[0], // KPI Customer
      summary: data?.cards.kpiCustomer,
    },
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[1], // KPI Proactive
      summary: data?.cards.kpiProactive,
    },
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[2], // Non KPI Unspec
      summary: data?.cards.nonKpiUnspec,
    },
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[3], // Non Technical
      summary: data?.cards.nonTechnical,
    },
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[4], // SQM Update
      summary: data?.cards.sqmUpdate,
    },
    {
      ...TICKET_MANAGEMENT_BUCKET_ITEMS[5], // Obsolete
      summary: data?.cards.obsolete,
    },
  ];

  const totalWorkboard = cardData.reduce(
    (sum, card) => sum + (card.summary?.total ?? 0),
    0,
  );

  return (
    <AdminLayout
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzone}
    >
      <div className='space-y-6'>
        <div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'>
          <div className='bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%)] p-6'>
            <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
              <div>
                <p className='text-xs font-bold tracking-[1.6px] text-slate-400 uppercase dark:text-slate-500'>
                  Ticket Management
                </p>
                <h1 className='mt-2 text-3xl font-black text-slate-900 dark:text-slate-100'>
                  Operational Overview
                </h1>
                <p className='mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400'>
                  Halaman ini menjadi pintu masuk Ticket Management. Fokusnya
                  bukan sekadar total ticket, tetapi pemisahan workload
                  berdasarkan bucket operasional yang mudah dibaca.
                </p>
              </div>
              <div className='rounded-2xl bg-white/75 px-5 py-4 text-right shadow-sm backdrop-blur dark:bg-slate-900/80'>
                <p className='text-[11px] font-bold tracking-[1.4px] text-slate-400 uppercase dark:text-slate-500'>
                  Total Workboard
                </p>
                <p className='mt-1 text-3xl font-black text-slate-900 dark:text-slate-100'>
                  {isLoading ? '...' : totalWorkboard}
                </p>
              </div>
            </div>
            <div className='mt-5 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80'>
              <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                <p className='text-[11px] font-bold tracking-[1.4px] text-slate-500 uppercase dark:text-slate-400'>
                  Priority Flag Overview
                </p>
                <span className='text-[11px] font-semibold text-slate-400'>
                  Total seluruh bucket
                </span>
              </div>
              <FlaggingMiniGrid counts={data?.totals} />
            </div>
          </div>

          <div className='grid gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-6 dark:border-slate-800 dark:bg-slate-800'>
            {cardData.map((card) => (
              <div key={card.key} className='bg-white p-4 dark:bg-slate-950'>
                <p className='text-[11px] font-bold tracking-[1.4px] text-slate-500 uppercase dark:text-slate-400'>
                  {card.label}
                </p>
                <p className='mt-2 text-3xl font-black text-slate-900 dark:text-slate-100'>
                  {isLoading ? '...' : (card.summary?.total ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className='space-y-4'>
          <HourlyChart workzone={workzone || undefined} />
          <SymptomChart workzone={workzone || undefined} />
        </div>

        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'>
          {cardData.map((card) => (
            <Link
              key={card.key}
              href={card.path}
              className={clsx(
                'group rounded-3xl border p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5',
                CARD_TONES[card.key],
              )}
            >
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <p className='text-2xl'>{card.icon}</p>
                  <h2 className='mt-3 text-xl font-black'>{card.label}</h2>
                  <p className='mt-2 text-sm leading-6 opacity-80'>
                    {card.description}
                  </p>
                </div>
                <div className='rounded-2xl bg-white/60 px-3 py-2 text-right shadow-sm dark:bg-black/10'>
                  <p className='text-[11px] font-bold tracking-[1.2px] uppercase opacity-70'>
                    Total
                  </p>
                  <p className='text-2xl font-black'>
                    {card.summary?.total ?? 0}
                  </p>
                </div>
              </div>

              <div className='mt-5 grid grid-cols-3 gap-2 text-center'>
                {[
                  ['Open', card.summary?.open ?? 0],
                  ['Assigned', card.summary?.assigned ?? 0],
                  ['Close', card.summary?.close ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className='rounded-2xl bg-white/55 px-3 py-2 dark:bg-black/10'
                  >
                    <p className='text-[10px] font-bold tracking-[1.2px] uppercase opacity-70'>
                      {label}
                    </p>
                    <p className='mt-1 text-lg font-black'>{value}</p>
                  </div>
                ))}
              </div>

              <div className='mt-2'>
                <FlaggingMiniGrid counts={card.summary} />
              </div>
            </Link>
          ))}
        </div>

        <div className='rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='text-xs font-bold tracking-[1.4px] text-slate-400 uppercase dark:text-slate-500'>
                Quick Access
              </p>
              <h2 className='mt-1 text-xl font-black text-slate-900 dark:text-slate-100'>
                Shortcut ke Area Kerja
              </h2>
            </div>
            <div className='flex flex-wrap gap-2'>
              {TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={item.path}
                  className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold tracking-[1px] text-slate-700 uppercase transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                >
                  {item.label}
                </Link>
              ))}
              <Link
                key={TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].key}
                href={TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].path}
                className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold tracking-[1px] text-slate-700 uppercase transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              >
                {TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].label}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
