import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function ObsoletePage() {
  return (
    <TicketManagementBucketPage
      title='Obsolete'
      description='Bucket obsolete untuk classification_path Z_PERMINTAAN_044, ticket permintaan pergantian CPE.'
      icon='OB'
      tone='purple'
      operationalBucket={['obsolete']}
      disableLocalSearch
    />
  );
}
