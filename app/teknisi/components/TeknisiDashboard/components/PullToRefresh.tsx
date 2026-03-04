// app/teknisi/components/TeknisiDashboard/components/PullToRefresh.tsx

interface PullToRefreshProps {
  pullDistance: number;
  ptrReady: boolean;
  ptrRefreshing: boolean;
}

export default function PullToRefresh({
  pullDistance,
  ptrReady,
  ptrRefreshing,
}: PullToRefreshProps) {
  return (
    <div
      className='pointer-events-none fixed top-0 right-0 left-0 z-50 flex justify-center'
      style={{
        transform: `translateY(${
          ptrRefreshing ? 0 : Math.min(0, pullDistance - 72)
        }px)`,
      }}
    >
      <div className='mt-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur'>
        {ptrRefreshing
          ? 'Merefresh...'
          : ptrReady
            ? 'Lepas untuk refresh'
            : 'Tarik untuk refresh'}
      </div>
    </div>
  );
}
