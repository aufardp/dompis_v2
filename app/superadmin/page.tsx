import AppPerformanceMonitor from '@/app/components/monitoring/AppPerformanceMonitor';

export default function SuperadminPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Infrastructure Monitor
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time overview of server workers, services, and system health
          </p>
        </div>

        <AppPerformanceMonitor />
      </div>
    </div>
  );
}
