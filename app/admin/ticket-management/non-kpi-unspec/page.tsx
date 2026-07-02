import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function TicketManagementNonKpiUnspecPage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='Unspec'
      description='Bucket investigasi untuk UNSPEC, UNSPEC-B2B, UNSPEC OHI yang butuh segera di amati.'
      icon='U'
      tone='amber'
      operationalBucket={['non_kpi_unspec']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
      extraWorkboard={{
        title: 'Unspec OHI',
        description: 'Ticket dengan symptom bertema PROACTIVE UNSPEC 2026.',
        tableLabel: 'Unspec OHI',
        symptom: 'PROACTIVE UNSPEC 2026',
        dept: 'all',
      }}
    />
  );
}
