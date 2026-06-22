import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiCustomerPage() {
  return (
    <TicketManagementBucketPage
      title='Customer'
      description='Bucket CUSTOMER, source ticket customer, yang sudah di breakdown B2C/B2B.'
      icon='C'
      tone='blue'
      operationalBucket={['kpi_customer']}
      disableLocalSearch
    />
  );
}
