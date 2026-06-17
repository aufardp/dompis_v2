import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiCustomerPage() {
  return (
    <TicketManagementBucketPage
      title='Customer'
      description='Source CUSTOMER, bucket KPI customer, dengan breakdown B2C/B2B dan SQM yang tetap terbaca di mode detail.'
      icon='C'
      tone='blue'
      operationalBucket={['kpi_customer']}
      disableLocalSearch
    />
  );
}
