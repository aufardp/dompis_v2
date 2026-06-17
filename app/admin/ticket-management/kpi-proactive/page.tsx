import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiProactivePage() {
  return (
    <TicketManagementBucketPage
      title='Proactive'
      description='Source PROACTIVE dengan fokus SQM, SQM-CCAN, dan tindak lanjut harian.'
      icon='P'
      tone='emerald'
      operationalBucket={['kpi_proactive']}
      disableLocalSearch
    />
  );
}
