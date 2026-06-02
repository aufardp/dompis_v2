import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiCustomerPage() {
  return (
    <TicketManagementBucketPage
      title='KPI Customer'
      description='Source: CUSTOMER | Classification: TECHNICAL | Jenis Tiket 1: Reguler, DATIN, Non DATIN, TSEL, VPN IP, CCAN, Regular, DWDM'
      icon='📘'
      tone='blue'
      operationalBucket={['kpi_customer']}
    />
  );
}
