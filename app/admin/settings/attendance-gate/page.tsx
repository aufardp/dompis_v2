import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/app/libs/auth';
import AttendanceGateSettingsClient from './AttendanceGateSettingsClient';

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

export default async function AttendanceGateSettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (String(user.role).toLowerCase() !== 'superadmin') redirect('/admin');

  return <AttendanceGateSettingsClient />;
}
