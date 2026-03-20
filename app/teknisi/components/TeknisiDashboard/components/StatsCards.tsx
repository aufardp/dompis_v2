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
  const val = (n: number) => (loading ? '—' : n);

  return (
    <div className='flex flex-col gap-2'>
      {/* Baris 1 — 2x2 grid: 4 status operasional */}
      <div className='grid grid-cols-2 gap-2'>
        {/* Menunggu */}
        <div className='rounded-xl border border-l-4 border-slate-200 border-l-amber-400 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'>
          <div className='text-2xl leading-none font-black text-amber-600 dark:text-amber-400 tabular-nums'>
            {val(stats.assigned)}
          </div>
          <div className='mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400'>
            ⏳ Menunggu
          </div>
        </div>

        {/* Dikerjakan */}
        <div className='rounded-xl border border-l-4 border-slate-200 border-l-blue-500 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'>
          <div className='text-2xl leading-none font-black text-blue-600 dark:text-blue-400 tabular-nums'>
            {val(stats.onProgress)}
          </div>
          <div className='mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400'>
            🔧 Dikerjakan
          </div>
        </div>

        {/* Pending */}
        <div className='rounded-xl border border-l-4 border-slate-200 border-l-purple-400 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'>
          <div className='text-2xl leading-none font-black text-purple-600 dark:text-purple-400 tabular-nums'>
            {val(stats.pending)}
          </div>
          <div className='mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400'>
            ⏸ Pending
          </div>
        </div>

        {/* Selesai */}
        <div className='rounded-xl border border-l-4 border-slate-200 border-l-green-500 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'>
          <div className='text-2xl leading-none font-black text-green-600 dark:text-green-400 tabular-nums'>
            {val(stats.closed)}
          </div>
          <div className='mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400'>
            ✓ Selesai
          </div>
        </div>
      </div>

      {/* Baris 2 — Banner penuh: Total Aktif */}
      <div className='flex items-center justify-between rounded-xl border border-l-4 border-slate-200 border-l-blue-500 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'>
        <span className='text-xs font-semibold text-slate-500 dark:text-slate-400'>
          📊 Total Aktif
        </span>
        <span className='text-2xl leading-none font-black text-blue-600 dark:text-blue-400 tabular-nums'>
          {val(stats.totalAktif)}
        </span>
      </div>
    </div>
  );
}
