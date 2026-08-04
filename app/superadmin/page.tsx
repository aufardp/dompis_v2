import AppPerformanceMonitor from '@/app/components/monitoring/AppPerformanceMonitor';
import AdminLayout from '@/app/components/layout/AdminLayout';

export default function SuperadminPage() {
  return (
    <AdminLayout>
      <div>
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) md:text-3xl">
              Infrastructure Monitor
            </h1>
            <p className="mt-1 text-sm text-(--text-muted)">
              Real-time overview of server workers, services, and system health
            </p>
          </div>

          <AppPerformanceMonitor />
        </div>
      </div>
    </AdminLayout>
  );
}
