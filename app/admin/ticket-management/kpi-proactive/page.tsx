import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementKpiProactivePage() {
  return (
    <TicketManagementBucketPage
      title='Proactive'
      description='Bucet PROACTIVE, source ticket PROACTIVE dengan fokus SQM, SQM-CCAN, yang harus segera di tindak lanjuti.'
      icon='P'
      tone='emerald'
      operationalBucket={['kpi_proactive']}
      disableLocalSearch
    />
  );
}
