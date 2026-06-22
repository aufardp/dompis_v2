import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function SqmUpdatePage() {
  return (
    <TicketManagementBucketPage
      title='SQM Update'
      description='Ticket SQM berstatus update, dipisah sebagai view untuk ditindak lanjuti.'
      icon='S'
      tone='slate'
      operationalBucket={['sqm_update']}
      disableLocalSearch
    />
  );
}
