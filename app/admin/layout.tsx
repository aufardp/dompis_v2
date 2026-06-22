import type { ReactNode } from 'react';
import { AdminToastProvider } from '@/app/admin/components/dashboard/admin-toast';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminToastProvider>{children}</AdminToastProvider>;
}
