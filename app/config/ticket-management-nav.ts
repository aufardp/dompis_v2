export type TicketManagementNavItem = {
  key: string;
  label: string;
  path: string;
  icon: string;
  description: string;
};

export const TICKET_MANAGEMENT_OVERVIEW_ITEMS: TicketManagementNavItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    path: '/admin/ticket-management/overview',
    icon: '🧭',
    description: 'Ringkasan seluruh bucket operasional Ticket Management.',
  },
];

export const TICKET_MANAGEMENT_BUCKET_ITEMS: TicketManagementNavItem[] = [
  {
    key: 'kpi-customer',
    label: 'KPI Customer',
    path: '/admin/ticket-management/kpi-customer',
    icon: '📘',
    description: 'Ticket KPI dari source CUSTOMER (TECHNICAL).',
  },
  {
    key: 'kpi-proactive',
    label: 'KPI Proactive',
    path: '/admin/ticket-management/kpi-proactive',
    icon: '📗',
    description: 'Ticket KPI dari source PROACTIVE channel 50/83.',
  },
  {
    key: 'non-kpi-unspec',
    label: 'Unspec',
    path: '/admin/ticket-management/non-kpi-unspec',
    icon: '🟠',
    description: 'Ticket Non-KPI (PROACTIVE ch 28).',
  },
  {
    key: 'non-technical',
    label: 'Non Technical',
    path: '/admin/ticket-management/non-technical',
    icon: '🔧',
    description: 'Ticket Non-Technical dari CUSTOMER (PERMINTAAN).',
  },
  {
    key: 'sqm-update',
    label: 'SQM Update',
    path: '/admin/ticket-management/sqm-update',
    icon: '🔄',
    description: 'Ticket SQM dengan headline [SQM-UPDATE].',
  },
  {
    key: 'obsolete',
    label: 'Obsolete',
    path: '/admin/ticket-management/obsolete',
    icon: '📦',
    description: 'Ticket dengan classification_path Z_PERMINTAAN_044.',
  },
];
