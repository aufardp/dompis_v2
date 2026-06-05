import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function SqmUpdatePage() {
  return (
    <TicketManagementBucketPage
      title='SQM Update'
      description='Ticket SQM yang sudah di-flag update dengan headline [SQM-UPDATE].'
      icon='🔄'
      tone='slate'
      operationalBucket={['sqm_update']}
    />
  );
}
