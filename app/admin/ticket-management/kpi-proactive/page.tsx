import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function TicketManagementKpiProactivePage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='Proactive'
      description='Bucet PROACTIVE, source ticket PROACTIVE dengan fokus SQM, SQM-CCAN, yang harus segera di tindak lanjuti.'
      icon='P'
      tone='emerald'
      operationalBucket={['kpi_proactive']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
    />
  );
}
