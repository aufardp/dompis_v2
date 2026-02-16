import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/app/libs/auth';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (token) {
    try {
      const decoded: any = verifyAccessToken(token);

      if (decoded.role === 'admin' || decoded.role === 'superadmin') {
        redirect('/admin');
      }

      if (decoded.role === 'teknisi') {
        redirect('/teknisi');
      }

      if (decoded.role === 'helpdesk') {
        redirect('/helpdesk');
      }
    } catch (error) {
      // token invalid → lanjut ke login
    }
  }

  redirect('/login');
}
