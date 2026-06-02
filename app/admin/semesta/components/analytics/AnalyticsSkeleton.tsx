export default function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="bg-surface h-[104px] w-[180px] shrink-0 animate-pulse rounded-xl border border-(--border)"
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-surface h-[340px] animate-pulse rounded-xl border border-(--border)" />
        <div className="bg-surface h-[340px] animate-pulse rounded-xl border border-(--border)" />
      </div>

      <div className="bg-surface h-[320px] animate-pulse rounded-xl border border-(--border)" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-surface h-[260px] animate-pulse rounded-xl border border-(--border)" />
        <div className="bg-surface h-[260px] animate-pulse rounded-xl border border-(--border)" />
      </div>
    </div>
  );
}
