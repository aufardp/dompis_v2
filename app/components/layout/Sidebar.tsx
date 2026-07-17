'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Archive,
  BarChart3,
  BookUser,
  CircleHelp,
  ChevronDown,
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
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TICKET_MANAGEMENT_BUCKET_ITEMS } from '@/app/config/ticket-management-nav';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import Image from 'next/image';

type MenuIcon = ComponentType<{ className?: string }>;

const MENU_ITEMS: Array<{
  label: string;
  path: string;
  icon: MenuIcon;
  superadminOnly?: boolean;
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
    label: 'Import Tiket',
    path: '/admin/import-tiket',
    icon: Upload,
    hint: 'Data pipeline',
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

function SectionToggle({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={clsx(
        'grid h-7 w-7 place-items-center rounded-full transition-all duration-200',
        expanded
          ? 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/10 dark:text-blue-100'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white',
      )}
      aria-label='Toggle ticket management submenu'
    >
      <ChevronDown
        className={clsx(
          'h-4 w-4 transition-transform duration-200',
          expanded ? 'rotate-180' : 'translate-y-px',
        )}
      />
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
  const [roleName, setRoleName] = useState('');
  const [ticketMenuExpanded, setTicketMenuExpanded] = useState(false);
  const { options: workzoneOptions } = useWorkzoneOptions();

  const { data: bucketCounts } = useQuery({
    queryKey: ['bucket-counts', selectedWorkzone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedWorkzone) params.set('workzone', selectedWorkzone);
      const res = await fetchWithAuth(`/api/tickets/bucket-counts?${params}`);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed to fetch bucket counts');
      return json.data as Record<string, number>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const bucketKeyMap: Record<string, string> = useMemo(() => ({
    'kpi-customer': 'kpi_customer',
    'kpi-proactive': 'kpi_proactive',
    'non-kpi-unspec': 'non_kpi_unspec',
    'non-technical': 'non_technical',
    'sqm-update': 'sqm_update',
    'obsolete': 'obsolete',
  }), []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const userRes = await fetchWithAuth('/api/users/me');
        if (!userRes) return;

        const data = await userRes.json();
        if (!cancelled && data.success) {
          setRoleName(String(data.data?.role_name ?? '').toLowerCase());
        }
      } catch {
        // Sidebar context is non-critical; keep the shell stable if auth is
        // temporarily unavailable or the request is blocked.
        if (!cancelled) {
          setRoleName('');
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
  };

  const isSuperAdmin = roleName === 'superadmin' || roleName === 'super_admin';
  const visibleMenuItems = MENU_ITEMS.filter(
    (item) => !item.superadminOnly || isSuperAdmin,
  );
  const isTicketManagementOpen =
    pathname === '/admin' || pathname.startsWith('/admin/ticket-management');
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

  useEffect(() => {
    if (isTicketManagementOpen) {
      setTicketMenuExpanded(true);
    }
  }, [isTicketManagementOpen]);

  const roleLabel = roleName ? roleName.replaceAll('_', ' ') : 'loading role';
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
              {visibleMenuItems.map((item) => {
                const isActive = isPathActive(pathname, item.path);
                const Icon = item.icon;
                const isAdminItem = item.path === '/admin';

                return (
                  <div key={item.path} className='space-y-2'>
                    <div className='relative'>
                      <NavButton
                        label={item.label}
                        hint={item.hint}
                        icon={Icon}
                        active={isActive}
                        onClick={() => handleNavigate(item.path)}
                        rightSlot={
                          isAdminItem ? (
                            <SectionToggle
                              expanded={ticketMenuExpanded}
                              onClick={(event) => {
                                event.stopPropagation();
                                setTicketMenuExpanded((value) => !value);
                              }}
                            />
                          ) : null
                        }
                      />
                    </div>

                    {isAdminItem && ticketMenuExpanded && (
                      <div className='ml-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-white/8 dark:bg-black/10'>
                        <div className='mb-2 flex items-center justify-between gap-2 px-1'>
                          <p className='text-[10px] font-bold tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400'>
                            Buckets
                          </p>
                          <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-200'>
                            {TICKET_MANAGEMENT_BUCKET_ITEMS.length}
                          </span>
                        </div>

                        <div className='grid gap-1.5'>
                          {TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => {
                            const subActive = pathname === item.path;
                            const Icon = SUBMENU_ICON_MAP[item.key] ?? Ticket;
                            const count = bucketCounts?.[bucketKeyMap[item.key]];

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
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
              {roleLabel}
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
