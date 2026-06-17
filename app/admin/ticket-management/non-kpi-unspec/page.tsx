import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementNonKpiUnspecPage() {
  return (
    <TicketManagementBucketPage
      title='Unspec'
      description='Bucket investigasi untuk UNSPEC dan UNSPEC-B2B yang belum punya klasifikasi final.'
      icon='U'
      tone='amber'
      operationalBucket={['non_kpi_unspec']}
      disableLocalSearch
      extraWorkboard={{
        title: 'Unspec OHI',
        description: 'Ticket dengan symptom bertema PROACTIVE UNSPEC 2026.',
        tableLabel: 'Unspec OHI',
        symptom: 'PROACTIVE UNSPEC 2026',
        dept: 'all',
      }}
    />
  );
}
