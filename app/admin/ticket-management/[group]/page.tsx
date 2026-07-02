import { notFound } from 'next/navigation';
import { B2B_GROUPS } from '@/app/config/b2b-groups';
import TicketManagementGroupPage from '@/app/admin/components/dashboard/TicketManagementGroupPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function TicketManagementGroupRoute({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = await params;
  const normalized = String(group ?? '').trim().toLowerCase();
  const groupMeta = B2B_GROUPS.find((item) => item.key === normalized);
  const initialWorkzone = await getInitialWorkzoneScope();

  if (!groupMeta) {
    notFound();
  }

  return (
    <TicketManagementGroupPage
      groupKey={groupMeta.key}
      initialWorkzone={initialWorkzone}
    />
  );
}
