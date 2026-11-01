import AdminLayout from '@/app/components/layout/AdminLayout';
import DashboardDurasiClient from '@/app/components/dashboard/durasi/DashboardDurasiClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';
import { getInitialBranchScope } from '@/app/helpers/get-initial-branch-scope';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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

  const initialBranch = await getInitialBranchScope();

  return (
    <AdminLayout>
      <div className='min-h-screen p-4 md:p-6'>
        <div className='mb-6 border-b border-(--border) pb-6'>
          <h1 className='text-xl font-bold uppercase tracking-wide text-(--text-primary)'>
            DURASI TIKET OPEN
          </h1>
          <p className='mt-1 text-xs text-(--text-secondary)'>
            Heat-map durasi per service area untuk monitoring harian.
          </p>
        </div>

        <div className='grid grid-cols-1 gap-4 pb-6 sm:grid-cols-3'>
          <div className='rounded border border-(--border) bg-(--surface) px-4 py-3 shadow-sm'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-(--text-muted)'>
              Fokus
            </p>
            <p className='mt-1 text-xs font-semibold text-(--text-primary)'>
              Durasi open per service area
            </p>
          </div>
          <div className='rounded border border-(--border) bg-(--surface) px-4 py-3 shadow-sm'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-(--text-muted)'>
              Cadence
            </p>
            <p className='mt-1 text-xs font-semibold text-(--text-primary)'>
              Auto-refresh tiap menit
            </p>
          </div>
          <div className='rounded border border-(--border) bg-(--surface) px-4 py-3 shadow-sm'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-(--text-muted)'>
              Peran Pengguna
            </p>
            <p className='mt-1 text-xs font-semibold text-(--text-primary)'>
              {user.role}
            </p>
          </div>
        </div>

        <div className='rounded border border-(--border) bg-(--surface) shadow-sm'>
          <DashboardDurasiClient initialBranch={initialBranch} />
        </div>
      </div>
    </AdminLayout>
  );
}
