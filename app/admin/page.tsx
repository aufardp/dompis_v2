import TicketManagementOverviewPage from '@/app/admin/components/dashboard/TicketManagementOverviewPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function AdminPage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return <TicketManagementOverviewPage initialWorkzone={initialWorkzone} />;
}
