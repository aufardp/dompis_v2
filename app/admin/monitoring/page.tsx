import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import DashboardDurasiClient from '@/app/components/dashboard/durasi/DashboardDurasiClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';
import ThemeToggleButton from '@/app/components/ui/ThemeToggleButton';

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export default async function MonitoringPage() {
  const user = await getUser();

  if (!user) {
    redirect('/auth/login');
  }

  if (user.role === 'teknisi') {
    redirect('/teknisi');
  }

  const homeHref = user.role === 'superadmin' || user.role === 'super_admin' ? '/superadmin' : '/admin';

  return (
    <div className="min-h-screen bg-(--bg) p-4 md:p-6">
      <div className="mx-auto mb-5 max-w-[1600px] overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm">
        <div className="flex flex-col gap-5 border-b border-(--border) bg-(--surface-2) px-5 py-5 md:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-blue-500 uppercase">
                Monitoring
              </span>
              <span className="rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase">
                SLA / Duration Health
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-[-0.3px] text-(--text-primary) md:text-4xl">
                Durasi Tiket Open
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-(--text-secondary)">
                Heat-map durasi per service area with a stable, glanceable panel for daily monitoring.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggleButton />
            <DashboardPageActions homeHref={homeHref} />
          </div>
        </div>
        <div className="grid gap-3 px-5 py-4 md:px-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-(--border) bg-(--bg) px-4 py-3">
            <p className="text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase">
              Focus
            </p>
            <p className="mt-1 text-sm font-semibold text-(--text-primary)">
              Open duration by service area
            </p>
          </div>
          <div className="rounded-2xl border border-(--border) bg-(--bg) px-4 py-3">
            <p className="text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase">
              Cadence
            </p>
            <p className="mt-1 text-sm font-semibold text-(--text-primary)">
              Auto-refresh every minute
            </p>
          </div>
          <div className="rounded-2xl border border-(--border) bg-(--bg) px-4 py-3">
            <p className="text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase">
              Scope
            </p>
            <p className="mt-1 text-sm font-semibold text-(--text-primary)">
              {user.role}
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1600px]">
        <DashboardDurasiClient />
      </div>
    </div>
  );
}
