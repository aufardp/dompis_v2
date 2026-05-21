import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import RekapWorkorderClient from '@/app/components/dashboard/rekap/RekapWorkorderClient';
import DashboardPageActions from '@/app/components/dashboard/DashboardPageActions';

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    return verifyAccessToken(token);
  } catch { return null; }
}

export default async function RekapWorkorderPage() {
  const user = await getUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="mb-4 flex justify-end">
        <DashboardPageActions homeHref="/helpdesk" />
      </div>
      <RekapWorkorderClient />
    </div>
  );
}
