import AdminLayout from '@/app/components/layout/AdminLayout';
import RekapWorkorderClient from '@/app/components/dashboard/rekap/RekapWorkorderClient';
import { getInitialBranchScope } from '@/app/helpers/get-initial-branch-scope';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';
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

export default async function RekapWorkorderPage({
  searchParams,
}: {
  searchParams?: Promise<{ branch?: string; workzone?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/auth/login');
  if (user.role === 'teknisi') redirect('/teknisi');
  
  const sp = searchParams ? await searchParams : {};
  const [cookieWorkzone, cookieBranch] = await Promise.all([
    getInitialWorkzoneScope(),
    getInitialBranchScope(),
  ]);
  const initialWorkzone = typeof sp.workzone === 'string' ? sp.workzone : cookieWorkzone;
  const initialBranch = typeof sp.branch === 'string' ? sp.branch : cookieBranch;

  return (
    <AdminLayout>
      <div className='min-h-screen p-4 sm:p-6'>
        <div className='mb-6 border-b border-(--border) pb-6'>
          <h1 className='text-xl font-bold uppercase tracking-wide text-(--text-primary)'>
            REKAP WORKORDER
          </h1>
          <p className='mt-1 text-xs text-(--text-secondary)'>
            Ringkasan distribusi tiket berdasarkan service area, segmen pelanggan, dan workzone.
          </p>
        </div>
        
        <div className='rounded border border-(--border) bg-(--surface) shadow-sm'>
          <RekapWorkorderClient initialWorkzone={initialWorkzone} initialBranch={initialBranch} />
        </div>
      </div>
    </AdminLayout>
  );
}
