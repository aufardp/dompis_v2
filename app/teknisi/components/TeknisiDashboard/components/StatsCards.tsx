// app/teknisi/components/TeknisiDashboard/components/StatsCards.tsx

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
  const cards = [
    {
      key: 'totalAktif',
      label: '📊 Total Aktif',
      value: stats.totalAktif,
      borderColor: 'border-l-blue-500',
      textColor: 'text-blue-600',
    },
    {
      key: 'assigned',
      label: '⏳ Menunggu',
      value: stats.assigned,
      borderColor: 'border-l-amber-400',
      textColor: 'text-amber-600',
    },
    {
      key: 'onProgress',
      label: '🔧 Dikerjakan',
      value: stats.onProgress,
      borderColor: 'border-l-blue-500',
      textColor: 'text-blue-600',
    },
    {
      key: 'pending',
      label: '⏸ Pending',
      value: stats.pending,
      borderColor: 'border-l-purple-400',
      textColor: 'text-purple-600',
    },
    {
      key: 'closed',
      label: '✓ Selesai',
      value: stats.closed,
      borderColor: 'border-l-green-500',
      textColor: 'text-green-600',
    },
  ];

  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5'>
      {cards.map((card) => (
        <div
          key={card.key}
          className={`rounded-xl border border-l-4 border-slate-200 ${card.borderColor} bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5`}
        >
          <div className={`text-3xl font-black ${card.textColor}`}>
            {loading ? '...' : card.value}
          </div>
          <div className='mt-0.5 text-xs font-medium text-slate-500'>
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}
