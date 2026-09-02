'use client';

import { useEffect, useMemo, useSyncExternalStore, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { subscribe, getSnapshot } from '@/app/libs/bucket-sync-store';
import clsx from 'clsx';
import {
  Activity,
  Archive,
  BarChart3,
  BookUser,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  Layers3,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Upload,
  UsersRound,
  Wrench,
  X,
  RefreshCcw,
  MapPinned,
  Ticket,
  Layers,
  Target,
} from 'lucide-react';
import ConnectionStatusIndicator from '@/app/components/ui/ConnectionStatusIndicator';
import { TICKET_MANAGEMENT_BUCKET_ITEMS } from '@/app/config/ticket-management-nav';
import ExpandableMenuGroup from '@/app/components/layout/ExpandableMenuGroup';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import Image from 'next/image';

type MenuIcon = ComponentType<{ className?: string }>;

const MENU_ITEMS: Array<{
  label: string;
  path: string;
  icon: MenuIcon;
  superadminOnly?: boolean;
  adminBranchVisible?: boolean;
  helpdeskVisible?: boolean;
  hint: string;
}> = [
  {
    label: 'Ticket Management',
    path: '/admin',
    icon: LayoutDashboard,
    hint: 'Overview buckets',
  },
  {
    label: 'Semesta Dompis',
    path: '/admin/semesta',
    icon: Layers3,
    hint: 'Data bank',
  },
  {
    label: 'Technicians',
    path: '/admin/technicians',
    icon: UsersRound,
    hint: 'Team capacity',
  },
  {
    label: 'Clustering',
    path: '/admin/clustering',
    icon: MapPinned,
    hint: 'Network groups',
  },
  {
    label: 'Monitoring Durasi',
    path: '/admin/monitoring',
    icon: Clock3,
    hint: 'SLA health',
  },
  {
    label: 'Rekap Workorder',
    path: '/admin/rekap-workorder',
    icon: BarChart3,
    hint: 'Workboard report',
  },
  {
    label: 'Detail WO HI',
    path: '/admin/detail-wo-hi',
    icon: SearchCheck,
    hint: 'Case investigation',
  },
  {
    label: 'Attendance Gate',
    path: '/admin/settings/attendance-gate',
    icon: Clock3,
    hint: 'B2B / B2C / Unset toggle',
    superadminOnly: true,
  },
  {
    label: 'Tools',
    path: '/admin/tools',
    icon: Wrench,
    hint: 'Utilities & maps',
    helpdeskVisible: true,
  },
  {
    label: 'Infrastructure Monitor',
    path: '/superadmin',
    icon: Activity,
    hint: 'Workers & system health',
    superadminOnly: true,
  },
  {
    label: 'Manajemen User',
    path: '/superadmin/users',
    icon: ShieldCheck,
    hint: 'User & hierarki region',
    superadminOnly: true,
    adminBranchVisible: true,
  },
  {
    label: 'Target KPI',
    path: '/superadmin/kpi-targets',
    icon: Target,
    hint: 'TTR Compliance & Assurance Guarantee',
    superadminOnly: true,
  },
  {
    label: 'Audit Log',
    path: '/admin/audit-log',
    icon: ShieldCheck,
    hint: 'Trail akses & compliance',
    superadminOnly: true,
  },
];

const TOOLS_ITEMS: Array<{
  key: string;
  label: string;
  path: string;
  icon: MenuIcon;
  hint: string;
  adminOnly?: boolean;
}> = [
  {
    key: 'war-map',
    label: 'War Map',
    path: '/admin/tools/war-map',
    icon: MapPinned,
    hint: 'Peta sebaran gangguan',
  },
  {
    key: 'import-tiket',
    label: 'Import Tiket',
    path: '/admin/tools/import-tiket',
    icon: Upload,
    hint: 'Data pipeline',
    adminOnly: true,
  },
  {
    key: 'import-kml',
    label: 'Import KML Skema',
    path: '/admin/tools/import-kml',
    icon: Layers,
    hint: 'Topologi ODC/ODP',
    adminOnly: true,
  },
];

const SUBMENU_ICON_MAP: Record<string, MenuIcon> = {
  'kpi-customer': BookUser,
  'kpi-proactive': Rocket,
  'non-kpi-unspec': CircleHelp,
  'non-technical': Wrench,
  'sqm-update': RefreshCcw,
  obsolete: Archive,
};

function isPathActive(pathname: string, path: string) {
  if (path === '/admin') {
    return (
      pathname === '/admin' || pathname.startsWith('/admin/ticket-management')
    );
  }
  return pathname === path || pathname.startsWith(path);
}

function NavButton({
  label,
  hint,
  active,
  onClick,
  icon: Icon,
  rightSlot,
}: {
  label: string;
  hint: string;
  active?: boolean;
  onClick?: () => void;
  icon: MenuIcon;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-200',
        active
          ? 'bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.08))] text-slate-900 ring-1 ring-blue-500/15 dark:bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.12))] dark:text-white dark:ring-blue-400/20'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-(--text-secondary) dark:hover:bg-white/5 dark:hover:text-(--text-primary)',
      )}
    >
      <button
        type='button'
        onClick={onClick}
        className='flex min-w-0 flex-1 items-center gap-3 text-left'
      >
        <div
          className={clsx(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors',
            active
              ? 'border-blue-500/15 bg-blue-500/10 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200'
              : 'border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:bg-slate-50 group-hover:text-slate-900 dark:border-white/5 dark:bg-white/3 dark:text-(--text-secondary) dark:group-hover:border-white/10 dark:group-hover:bg-white/5 dark:group-hover:text-(--text-primary)',
          )}
        >
          <Icon className='h-4 w-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm leading-tight font-semibold'>
            {label}
          </p>
          <p className='truncate text-[11px] leading-tight text-slate-500 dark:text-(--text-muted)'>
            {hint}
          </p>
        </div>
      </button>
      {rightSlot}
    </div>
  );
}

function SubmenuButton({
  label,
  icon: Icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon: MenuIcon;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={clsx(
        'group w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-all duration-200',
        active
          ? 'bg-blue-500/10 text-slate-900 ring-1 ring-blue-500/15 dark:bg-blue-500/15 dark:text-white dark:ring-blue-400/25'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-(--text-secondary) dark:hover:bg-white/6 dark:hover:text-(--text-primary)',
      )}
    >
      <div className='flex items-center gap-2.5'>
        <span
          className={clsx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors',
            active
              ? 'border-blue-500/15 bg-blue-500/10 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-200'
              : 'border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:bg-slate-50 group-hover:text-slate-900 dark:border-white/5 dark:bg-white/3 dark:text-(--text-secondary) dark:group-hover:border-white/10 dark:group-hover:bg-white/6 dark:group-hover:text-(--text-primary)',
          )}
        >
          <Icon className='h-3.5 w-3.5' />
        </span>
        <span className='min-w-0 flex-1 truncate'>{label}</span>
        {typeof count === 'number' && (
          <span className='shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/8 dark:text-(--text-secondary)'>
            {count.toLocaleString('id-ID')}
          </span>
        )}
      </div>
    </button>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
  selectedWorkzone,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedWorkzone?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { options: workzoneOptions } = useWorkzoneOptions();
  const { user } = useCurrentUser();
  const { branch } = usePersistentBranchScope();
  const roleName = String(user?.role_name ?? '').toLowerCase();
  const roleKey = String(user?.role_key ?? '').toLowerCase();

  const kpiCustomerQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['kpi_customer'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const kpiProactiveQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['kpi_proactive'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const nonKpiUnspecQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['non_kpi_unspec'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const nonTechnicalQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['non_technical'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const sqmUpdateQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['sqm_update'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const obsoleteQuery = useDailyTicketPage({
    dept: 'all',
    operationalBucket: ['obsolete'],
    page: 1,
    limit: 1,
    workzone: selectedWorkzone || undefined,
    branch: branch || undefined,
    includeValidasiTickets: false,
    includeOptions: false,
    countOnly: true,
  });

  const syncedCounts = useSyncExternalStore(subscribe, getSnapshot);

  const kpiCustomerTotal =
    kpiCustomerQuery.loading
      ? (syncedCounts['kpi-customer'] ?? kpiCustomerQuery.summary.total)
      : kpiCustomerQuery.summary.total;
  const kpiProactiveTotal =
    kpiProactiveQuery.loading
      ? (syncedCounts['kpi-proactive'] ?? kpiProactiveQuery.summary.total)
      : kpiProactiveQuery.summary.total;
  const nonKpiUnspecTotal =
    nonKpiUnspecQuery.loading
      ? (syncedCounts['non-kpi-unspec'] ?? nonKpiUnspecQuery.summary.total)
      : nonKpiUnspecQuery.summary.total;
  const nonTechnicalTotal =
    nonTechnicalQuery.loading
      ? (syncedCounts['non-technical'] ?? nonTechnicalQuery.summary.total)
      : nonTechnicalQuery.summary.total;
  const sqmUpdateTotal =
    sqmUpdateQuery.loading
      ? (syncedCounts['sqm-update'] ?? sqmUpdateQuery.summary.total)
      : sqmUpdateQuery.summary.total;
  const obsoleteTotal =
    obsoleteQuery.loading
      ? (syncedCounts['obsolete'] ?? obsoleteQuery.summary.total)
      : obsoleteQuery.summary.total;

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
  };

  const isSuperAdmin =
    roleKey === 'superadmin' ||
    roleName === 'superadmin' ||
    roleName === 'super_admin' ||
    roleName === 'super admin';
  const isAdminBranch = roleKey === 'admin_branch';
  const isHelpdesk = roleKey === 'helpdesk';
  const handled = useMemo(() => {
    const items = MENU_ITEMS.filter((item) => {
      if (item.superadminOnly) {
        return isSuperAdmin || (item.adminBranchVisible && isAdminBranch);
      }
      if (item.helpdeskVisible) return true;
      return !isHelpdesk;
    });
    return items;
  }, [isSuperAdmin, isAdminBranch, isHelpdesk]);
  const selectedWorkzoneLabel = useMemo(() => {
    if (!selectedWorkzone) return 'All workzones';
    const workzones = workzoneOptions ?? [];
    const normalized = selectedWorkzone.trim().toLowerCase();
    const exact = workzones.find(
      (item) =>
        String(item.value ?? '')
          .trim()
          .toLowerCase() === normalized,
    );
    if (exact) {
      return String(exact.label ?? selectedWorkzone);
    }
    const partial = workzones.find((item) =>
      String(item.label ?? '')
        .trim()
        .toLowerCase()
        .includes(normalized),
    );
    return String(partial?.label ?? selectedWorkzone);
  }, [selectedWorkzone, workzoneOptions]);

  const isTicketManagementAllowed =
    !isHelpdesk &&
    handled.some((item) => item.path === '/admin');
  const isToolsAllowed = handled.some((item) => item.path === '/admin/tools');
  const visibleToolsItems = useMemo(
    () => TOOLS_ITEMS.filter((item) => !(isHelpdesk && item.adminOnly)),
    [isHelpdesk],
  );

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] text-slate-900 shadow-[12px_0_28px_-26px_rgba(15,23,42,0.35)] backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:h-screen lg:w-64 lg:translate-x-0 dark:border-(--border) dark:bg-[linear-gradient(180deg,rgba(9,12,20,0.98),rgba(11,17,30,0.95))] dark:text-white dark:shadow-[18px_0_40px_-32px_rgba(15,23,42,0.9)]',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className='border-b border-slate-200 px-4 py-4 dark:border-white/8'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <div className='relative h-11 w-11 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-blue-900/10 dark:border-white/8 dark:bg-white/5'>
                <Image
                  src='/assets/logo.webp'
                  alt='Dompis logo'
                  fill
                  sizes='44px'
                  className='object-contain p-1.5'
                  priority
                />
              </div>
              <div className='min-w-0'>
                <p className='truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white'>
                  Dompis
                </p>
                <p className='text-[10px] font-semibold tracking-[0.24em] text-slate-500 uppercase dark:text-slate-300'>
                  Operation
                </p>
              </div>
            </div>
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <span className='rounded-full border border-blue-500/15 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-blue-700 uppercase dark:border-blue-400/20 dark:text-blue-100'>
                Live
              </span>
              <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-slate-600 uppercase dark:border-white/10 dark:bg-white/6 dark:text-slate-200'>
                {selectedWorkzoneLabel}
              </span>
              <ConnectionStatusIndicator />
            </div>
          </div>

          <button
            onClick={onClose}
            className='rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden dark:border-white/8 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
            aria-label='Close sidebar'
          >
            <X className='h-5 w-5' />
          </button>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto px-3 py-4'>
        {/* <div className='mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-900 dark:border-white/8 dark:bg-white/4 dark:text-white'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <p className='text-[10px] font-bold tracking-[0.24em] text-slate-500 uppercase dark:text-slate-400'>
                Context
              </p>
              <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-white'>
                {roleLabel}
              </p>
            </div>
            <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-200'>
              {selectedWorkzoneLabel}
            </span>
          </div>
        </div> */}

        <nav className='space-y-4'>
          <div>
            <p className='mb-2 px-2 text-[10px] font-bold tracking-[0.24em] text-slate-500 uppercase dark:text-slate-400'>
              Workspace
            </p>
            <div className='flex flex-col gap-1.5'>
              {isTicketManagementAllowed && (
                <ExpandableMenuGroup
                  label='Ticket Management'
                  hint='Overview buckets'
                  path='/admin'
                  icon={LayoutDashboard}
                  openPathPrefixes={['/admin/ticket-management', '/admin']}
                  onNavigate={handleNavigate}
                  count={TICKET_MANAGEMENT_BUCKET_ITEMS.length}
                >
                  {TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => {
                    const subActive = pathname === item.path;
                    const Icon = SUBMENU_ICON_MAP[item.key] ?? Ticket;
                    const count =
                      item.key === 'kpi-customer'
                        ? kpiCustomerTotal
                        : item.key === 'kpi-proactive'
                          ? kpiProactiveTotal
                          : item.key === 'non-kpi-unspec'
                            ? nonKpiUnspecTotal
                            : item.key === 'non-technical'
                              ? nonTechnicalTotal
                              : item.key === 'sqm-update'
                                ? sqmUpdateTotal
                                : item.key === 'obsolete'
                                  ? obsoleteTotal
                                  : undefined;

                    return (
                      <SubmenuButton
                        key={item.key}
                        label={item.label}
                        icon={Icon}
                        active={subActive}
                        count={count}
                        onClick={() => handleNavigate(item.path)}
                      />
                    );
                  })}
                </ExpandableMenuGroup>
              )}

              {handled
                .filter(
                  (item) =>
                    item.path !== '/admin' && item.path !== '/admin/tools',
                )
                .map((item) => {
                  const isActive = isPathActive(pathname, item.path);
                  const Icon = item.icon;

                  return (
                    <NavButton
                      key={item.path}
                      label={item.label}
                      hint={item.hint}
                      icon={Icon}
                      active={isActive}
                      onClick={() => handleNavigate(item.path)}
                    />
                  );
                })}

              {isToolsAllowed && (
                <ExpandableMenuGroup
                  label='Tools'
                  hint='Utilities & maps'
                  path='/admin/tools'
                  icon={Wrench}
                  openPathPrefixes={['/admin/tools']}
                  onNavigate={(path) => handleNavigate(path)}
                  count={visibleToolsItems.length}
                >
                  {visibleToolsItems.map((item) => {
                    const subActive = pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <SubmenuButton
                        key={item.key}
                        label={item.label}
                        icon={Icon}
                        active={subActive}
                        onClick={() => handleNavigate(item.path)}
                      />
                    );
                  })}
                </ExpandableMenuGroup>
              )}
            </div>
          </div>
        </nav>
      </div>

      <div className='border-t border-slate-200 p-3 dark:border-white/8'>
        <div className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 dark:border-white/8 dark:bg-white/5 dark:text-white'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,165,233,0.95),rgba(99,102,241,0.92))] text-sm font-bold text-white shadow-lg shadow-blue-950/20'>
            <ShieldCheck className='h-5 w-5' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-xs font-semibold text-slate-900 uppercase dark:text-white'>
              {user?.nama || 'User'}
            </p>
            <p className='truncate text-xs text-slate-600 dark:text-slate-300'>
              {selectedWorkzoneLabel}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
