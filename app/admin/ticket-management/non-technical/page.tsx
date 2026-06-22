import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementNonTechnicalPage() {
  return (
    <TicketManagementBucketPage
      title='Non Technical'
      description='Bucket untuk tiket non technical, seperti billing, non-numbering dan lain sebagainya.'
      icon='NT'
      tone='amber'
      operationalBucket={['non_technical']}
      disableLocalSearch
    />
  );
}
