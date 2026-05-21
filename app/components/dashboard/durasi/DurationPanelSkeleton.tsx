export default function DurationPanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 animate-pulse">
      <div className="bg-gray-900 px-3 py-2 dark:bg-gray-950">
        <div className="h-4 w-40 rounded bg-gray-700" />
      </div>
      <div className="p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2 py-1.5">
            <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-4 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
