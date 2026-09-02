import {
  BookOpen,
  BookText,
  Compass,
  Package,
  RefreshCcw,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type TicketManagementNavItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
};

export const TICKET_MANAGEMENT_OVERVIEW_ITEMS: TicketManagementNavItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    path: '/admin/ticket-management/overview',
    icon: Compass,
    description: 'Ringkasan seluruh bucket operasional Ticket Management.',
  },
];

export const TICKET_MANAGEMENT_BUCKET_ITEMS: TicketManagementNavItem[] = [
  {
    key: 'kpi-customer',
    label: 'Customer',
    path: '/admin/ticket-management/kpi-customer',
    icon: BookOpen,
    description: 'Ticket KPI dari source CUSTOMER (TECHNICAL).',
  },
  {
    key: 'kpi-proactive',
    label: 'Proactive',
    path: '/admin/ticket-management/kpi-proactive',
    icon: BookText,
    description: 'Ticket KPI dari source PROACTIVE channel 50/83.',
  },
  {
    key: 'non-kpi-unspec',
    label: 'Unspec',
    path: '/admin/ticket-management/non-kpi-unspec',
    icon: Package,
    description: 'Ticket Non-KPI (PROACTIVE ch 28).',
  },
  {
    key: 'non-technical',
    label: 'Non Technical',
    path: '/admin/ticket-management/non-technical',
    icon: Wrench,
    description: 'Ticket Non-Technical dari CUSTOMER (PERMINTAAN).',
  },
  {
    key: 'sqm-update',
    label: 'SQM Update',
    path: '/admin/ticket-management/sqm-update',
    icon: RefreshCcw,
    description: 'Ticket SQM yang sudah di-flag update (kolom sqm_update_reason).',
  },
  {
    key: 'obsolete',
    label: 'Obsolete',
    path: '/admin/ticket-management/obsolete',
    icon: Package,
    description: 'Ticket dengan classification_path Z_PERMINTAAN_044.',
  },
];
