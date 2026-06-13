import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiProactivePage() {
  return (
    <TicketManagementBucketPage
      title='Proactive'
      description='Source: PROACTIVE | Classification: TECHNICAL | Channel: 50, 83 | Jenis Tiket 1: SQM, SQM-CCAN'
      icon='📗'
      tone='emerald'
      operationalBucket={['kpi_proactive']}
      disableLocalSearch
    />
  );
}
