import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';
import { cookies } from 'next/headers';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { AdminToastProvider } from '@/app/admin/components/dashboard/admin-toast';
import KpiTargetsClient from './KpiTargetsClient';

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

export default async function KpiTargetsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const role = String(user.role).toLowerCase();
  if (role !== 'superadmin') redirect('/admin');

  return (
    <AdminLayout>
      <AdminToastProvider>
        <KpiTargetsClient />
      </AdminToastProvider>
    </AdminLayout>
  );
}
