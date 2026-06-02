export default function RekapSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="overflow-hidden rounded-lg border border-(--border)">
        <div className="bg-(--surface-2) px-4 py-3">
          <div className="h-5 w-48 rounded bg-(--surface-3)" />
        </div>
        <div className="p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-6 w-6 rounded bg-(--surface-3)" />
              <div className="h-6 w-24 rounded bg-(--surface-3)" />
              <div className="h-6 flex-1 rounded bg-(--surface-2)" />
              <div className="h-6 w-16 rounded bg-(--surface-3)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
