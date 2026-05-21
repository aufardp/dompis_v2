export default function RekapSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="bg-gray-900 px-4 py-3 dark:bg-gray-950">
          <div className="h-5 w-48 rounded bg-gray-700" />
        </div>
        <div className="p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-6 w-6 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-6 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-6 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-6 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
