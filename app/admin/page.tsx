import TicketManagementOverviewPage from '@/app/admin/components/dashboard/TicketManagementOverviewPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';
import { getInitialBranchScope } from '@/app/helpers/get-initial-branch-scope';

export default async function AdminPage() {
  const [initialWorkzone, initialBranch] = await Promise.all([
    getInitialWorkzoneScope(),
    getInitialBranchScope(),
  ]);
  return (
    <TicketManagementOverviewPage
      initialWorkzone={initialWorkzone}
      initialBranch={initialBranch}
    />
  );
}
