import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/app/libs/auth';
import RekapWorkorderClient from '@/app/components/dashboard/rekap/RekapWorkorderClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';
import ThemeToggleButton from '@/app/components/ui/ThemeToggleButton';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';
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

export default async function RekapWorkorderPage({
  searchParams,
}: {
  searchParams?: Promise<{ branch?: string; workzone?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/auth/login');
  if (user.role === 'teknisi') redirect('/teknisi');
  const homeHref = '/admin';
  const sp = searchParams ? await searchParams : {};
  const [cookieWorkzone, cookieBranch] = await Promise.all([
    getInitialWorkzoneScope(),
    getInitialBranchScope(),
  ]);
  const initialWorkzone = typeof sp.workzone === 'string' ? sp.workzone : cookieWorkzone;
  const initialBranch = typeof sp.branch === 'string' ? sp.branch : cookieBranch;

  return (
    <div className='min-h-screen bg-(--bg) p-4 md:p-6'>
      <div className='mb-5 flex items-start justify-between gap-4'>
        <div>
          <div className='mb-1 flex items-center gap-2'>
            <div className='h-5 w-1 rounded-full bg-amber-500' />
            <span className='text-xs font-semibold tracking-widest text-(--text-muted) uppercase'>
              Workorder
            </span>
          </div>
          <h1 className='text-xl leading-tight font-bold text-(--text-primary)'>
            Rekap Workorder
          </h1>
          <p className='mt-0.5 text-xs text-(--text-secondary)'>
            Distribusi tiket per service area, segment, dan workzone
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <ThemeToggleButton />
          <DashboardPageActions homeHref={homeHref} />
        </div>
      </div>
      <RekapWorkorderClient initialWorkzone={initialWorkzone} initialBranch={initialBranch} />
    </div>
  );
}
