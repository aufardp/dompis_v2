import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';
import { getInitialWorkzoneScope } from '@/app/helpers/get-initial-workzone-scope';

export default async function ObsoletePage() {
  const initialWorkzone = await getInitialWorkzoneScope();
  return (
    <TicketManagementBucketPage
      title='Obsolete'
      description='Bucket obsolete untuk classification_path Z_PERMINTAAN_044, ticket permintaan pergantian CPE.'
      icon='OB'
      tone='purple'
      operationalBucket={['obsolete']}
      disableLocalSearch
      initialWorkzone={initialWorkzone}
    />
  );
}
