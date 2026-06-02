export default function DurationPanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--surface) animate-pulse">
      <div className="bg-(--surface-2) px-4 py-3">
        <div className="h-4 w-40 rounded bg-(--surface-3)" />
      </div>
      <div className="p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2 py-1.5">
            <div className="h-4 w-20 rounded bg-(--surface-3)" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-4 flex-1 rounded bg-(--surface-2)" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
