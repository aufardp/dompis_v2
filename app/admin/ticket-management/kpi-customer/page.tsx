import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function TicketManagementKpiCustomerPage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='Customer'
      description='Bucket CUSTOMER, source ticket customer, yang sudah di breakdown B2C/B2B.'
      icon='C'
      tone='blue'
      operationalBucket={['kpi_customer']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
    />
  );
}
