import TicketManagementOverviewPage from '@/app/admin/components/dashboard/TicketManagementOverviewPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';
import { getInitialBranchScope } from '@/app/helpers/get-initial-branch-scope';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ branch?: string; workzone?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const [cookieWorkzone, cookieBranch] = await Promise.all([
    getInitialWorkzoneScope(),
    getInitialBranchScope(),
  ]);
  // URL is source of truth — prefer searchParams over legacy cookie
  const initialWorkzone = typeof sp.workzone === 'string' ? sp.workzone : cookieWorkzone;
  const initialBranch = typeof sp.branch === 'string' ? sp.branch : cookieBranch;
  return (
    <TicketManagementOverviewPage
      initialWorkzone={initialWorkzone}
      initialBranch={initialBranch}
    />
  );
}
