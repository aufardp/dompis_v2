'use client';

// app/teknisi/components/TeknisiDashboard/components/StatsCards.tsx
import { BarChart3, CheckCircle2, Clock3, PauseCircle, Wrench } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
    totalAktif: number;
  };
  loading: boolean;
}

export default function StatsCards({ stats, loading }: StatsCardsProps) {
  const val = (n: number) => (loading ? '—' : n);

  const cards = [
    {
      label: 'Menunggu',
      value: stats.assigned,
      icon: Clock3,
      accent: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Dikerjakan',
      value: stats.onProgress,
      icon: Wrench,
      accent: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Pending',
      value: stats.pending,
      icon: PauseCircle,
      accent: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Selesai',
      value: stats.closed,
      icon: CheckCircle2,
      accent: 'text-green-600 dark:text-green-400',
    },
  ];

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3'>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className='rounded-[28px] border border-(--border) bg-(--surface) p-4 shadow-sm'
            >
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold tracking-[0.28em] text-(--text-tertiary) uppercase'>
                    {card.label}
                  </p>
                  <div className={`mt-2 text-[28px] leading-none font-semibold tabular-nums ${card.accent}`}>
                    {val(card.value)}
                  </div>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-full border border-current/15 ${card.accent}`}>
                  <Icon size={16} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className='flex items-center justify-between rounded-[28px] border border-(--border) bg-(--surface) px-4 py-3 shadow-sm'>
        <span className='inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.28em] text-(--text-tertiary) uppercase'>
          <BarChart3 size={13} />
          Total Aktif
        </span>
        <span className='text-[28px] leading-none font-semibold tabular-nums text-(--text-primary)'>
          {val(stats.totalAktif)}
        </span>
      </div>
    </div>
  );
}
