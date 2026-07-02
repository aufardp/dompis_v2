import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function SqmUpdatePage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='SQM Update'
      description='Ticket SQM berstatus update, dipisah sebagai view untuk ditindak lanjuti.'
      icon='S'
      tone='slate'
      operationalBucket={['sqm_update']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
    />
  );
}
