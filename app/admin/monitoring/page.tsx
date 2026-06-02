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
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-5 w-1 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
              Monitoring
            </span>
          </div>
          <h1 className="text-xl font-bold text-(--text-primary) leading-tight">
            Durasi Tiket Open
          </h1>
          <p className="text-xs text-(--text-secondary) mt-0.5">
            Heat-map durasi per service area &middot; auto-refresh setiap menit
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggleButton />
          <DashboardPageActions homeHref={homeHref} />
        </div>
      </div>
      <DashboardDurasiClient />
    </div>
  );
}
