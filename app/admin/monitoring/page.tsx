import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import DashboardDurasiClient from '@/app/components/dashboard/durasi/DashboardDurasiClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    return verifyAccessToken(token);
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

  const homeHref = user.role === 'superadmin' ? '/superadmin' : '/admin';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Dashboard Monitoring Durasi Tiket
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Monitoring durasi ticket open per area dan jenis ticket
          </p>
        </div>
        <DashboardPageActions homeHref={homeHref} />
      </div>
      <DashboardDurasiClient />
    </div>
  );
}
