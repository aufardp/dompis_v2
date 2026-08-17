import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import DetailWoHiClient from '@/app/components/dashboard/detail-wo-hi/DetailWoHiClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';
import ThemeToggleButton from '@/app/components/ui/ThemeToggleButton';
import { getInitialBranchScope } from '@/app/helpers/get-initial-branch-scope';

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

export default async function DetailWoHiPage() {
  const user = await getUser();
  if (!user) redirect('/auth/login');
  if (user.role === 'teknisi') redirect('/teknisi');
  const homeHref = '/admin';
  const initialBranch = await getInitialBranchScope();

  return (
    <div className='min-h-screen bg-(--bg) p-4 md:p-6'>
      <div className='mb-5 flex items-start justify-between gap-4'>
        <div>
          <div className='mb-1 flex items-center gap-2'>
            <div className='h-5 w-1 rounded-full bg-cyan-500' />
            <span className='text-xs font-semibold tracking-widest text-(--text-muted) uppercase'>
              Workorder
            </span>
          </div>
          <h1 className='text-xl leading-tight font-bold text-(--text-primary)'>
            Detail WO HI
          </h1>
          <p className='mt-0.5 text-xs text-(--text-secondary)'>
            Ringkasan detail tiket workorder hari ini &middot; semua segmen
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <ThemeToggleButton />
          <DashboardPageActions homeHref={homeHref} />
        </div>
      </div>
      <DetailWoHiClient initialBranch={initialBranch} />
    </div>
  );
}
