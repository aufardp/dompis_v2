export default function RekapSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="overflow-hidden rounded-lg border border-(--border)">
        <div className="bg-(--surface-2) px-4 py-3">
          <div className="h-5 w-48 rounded bg-(--surface-3)" />
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-(--border) bg-(--surface-2) p-3">
                <div className="h-3 w-20 rounded bg-(--surface-3)" />
                <div className="mt-3 h-6 w-16 rounded bg-(--surface-3)" />
                <div className="mt-2 h-3 w-24 rounded bg-(--surface-3)" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
            <div className="space-y-3">
              <div className="h-[360px] rounded-2xl border border-(--border) bg-(--surface-2)" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-(--border) bg-(--surface-2) p-2">
                    <div className="mx-auto h-3 w-6 rounded bg-(--surface-3)" />
                    <div className="mx-auto mt-2 h-8 w-2 rounded bg-(--surface-3)" />
                    <div className="mx-auto mt-2 h-3 w-4 rounded bg-(--surface-3)" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-[260px] rounded-2xl border border-(--border) bg-(--surface-2)" />
              <div className="h-[150px] rounded-2xl border border-(--border) bg-(--surface-2)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
