import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function TicketManagementNonTechnicalPage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='Non Technical'
      description='Bucket untuk tiket non technical, seperti billing, non-numbering dan lain sebagainya.'
      icon='NT'
      tone='amber'
      operationalBucket={['non_technical']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
    />
  );
}
