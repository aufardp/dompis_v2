import TicketManagementBucketPage from '@/app/admin/components/dashboard/TicketManagementBucketPage';

export default function TicketManagementNonKpiUnspecPage() {
  return (
    <TicketManagementBucketPage
      title='Non KPI Unspec'
      description='Source: PROACTIVE | Classification: TECHNICAL | Channel: 28 | Jenis Tiket 1: UNSPEC, UNSPEC B2B'
      icon='🟠'
      tone='amber'
      operationalBucket={['non_kpi_unspec']}
      disableLocalSearch
      extraWorkboard={{
        title: 'Unspec OHI',
        description: 'Ticket dengan symptom mengandung PROACTIVE UNSPEC 2026.',
        tableLabel: 'Unspec OHI',
        symptom: 'PROACTIVE UNSPEC 2026',
        dept: 'all',
      }}
    />
  );
}
