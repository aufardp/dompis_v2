'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ChevronDown, X } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TICKET_MANAGEMENT_BUCKET_ITEMS } from '@/app/config/ticket-management-nav';
import { useTicketManagementOverview } from '@/app/hooks/useTicketManagementOverview';

const MENU_ITEMS: Array<{
  label: string;
  path: string;
  icon: string;
  superadminOnly?: boolean;
}> = [
  {
    label: 'Ticket Management',
    path: '/admin',
    icon: '📋',
  },
  {
    label: 'Semesta Dompis',
    path: '/admin/semesta',
    icon: '🗄️',
  },
  {
    label: 'Technicians',
    path: '/admin/technicians',
    icon: '👨‍🔧',
  },
  {
    label: 'Clustering',
    path: '/admin/clustering',
    icon: '🗺️',
  },
  {
    label: 'Monitoring Durasi',
    path: '/admin/monitoring',
    icon: '⏱️',
  },
  {
    label: 'Rekap Workorder',
    path: '/admin/rekap-workorder',
    icon: '📊',
  },
  {
    label: 'Detail WO HI',
    path: '/admin/detail-wo-hi',
    icon: '📋',
  },
  {
    label: 'Import Tiket',
    path: '/admin/import-tiket',
    icon: '📥',
  },
];

interface NavItemProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  dotColor?: string;
  icon?: string;
}

function NavItem({ label, active, onClick, dotColor, icon }: NavItemProps) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
        active
          ? 'bg-white/10 text-(--text-primary)'
          : 'text-(--text-secondary) hover:bg-white/5 hover:text-(--text-primary)'
      }`}
    >
      <div className='flex items-center gap-3'>
        {icon && <span className='text-base'>{icon}</span>}
        {dotColor && (
          <span
            className='h-2 w-2 rounded-full'
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span>{label}</span>
      </div>
    </div>
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

  const { data: ticketManagementOverview } = useTicketManagementOverview(
    true,
    selectedWorkzone || undefined,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const userRes = await fetchWithAuth('/api/users/me');

        if (userRes) {
          const data = await userRes.json();
          if (!cancelled && data.success) {
            setRoleName(String(data.data?.role_name ?? '').toLowerCase());
          }
        }
      } catch (error) {
        console.error('Failed to load sidebar user role:', error);
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

  useEffect(() => {
    if (isTicketManagementOpen) {
      setTicketMenuExpanded(true);
    }
  }, [isTicketManagementOpen]);

  return (
    <aside
      className={`bg-surface fixed inset-y-0 left-0 z-50 flex w-70 flex-col border-r border-(--border) transition-transform duration-300 ease-in-out lg:static lg:w-55 lg:h-screen lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Header */}
      <div className='flex items-center justify-between p-4 lg:p-4'>
        <div>
          <p className='text-xl font-semibold tracking-tight text-(--text-primary)'>
            Dompis
          </p>
          <p className='text-[10px] tracking-[2px] text-(--text-secondary) uppercase'>
            Admin Portal
          </p>
        </div>
        <button
          onClick={onClose}
          className='hover:bg-surface-2 rounded-lg p-2 lg:hidden'
        >
          <X className='h-5 w-5 text-(--text-secondary)' />
        </button>
      </div>

      {/* Main Navigation */}
      <div className='px-3 lg:px-3'>
        <p className='mb-2 px-2 text-[10px] font-bold tracking-[1.5px] text-(--text-muted) uppercase'>
          Main
        </p>
        <nav className='mb-6 flex flex-col gap-1'>
          {visibleMenuItems.map((item) => {
            const isActive =
              pathname === item.path ||
              (item.path === '/admin' && pathname === '/admin') ||
              (item.path === '/admin' &&
                pathname.startsWith('/admin/ticket-management')) ||
              (item.path === '/admin/clustering' && pathname.startsWith('/admin/clustering')) ||
              (item.path === '/admin/monitoring' && pathname.startsWith('/admin/monitoring')) ||
              (item.path === '/admin/rekap-workorder' && pathname.startsWith('/admin/rekap-workorder')) ||
              (item.path === '/admin/detail-wo-hi' && pathname.startsWith('/admin/detail-wo-hi'));
            return (
              <div key={item.path}>
                {item.path === '/admin' ? (
                  <>
                    <div
                      onClick={() => handleNavigate(item.path)}
                      className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-white/10 text-(--text-primary)'
                          : 'text-(--text-secondary) hover:bg-white/5 hover:text-(--text-primary)'
                      }`}
                    >
                      <div className='flex items-center justify-between gap-3'>
                        <div className='flex items-center gap-3'>
                          <span className='text-base'>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        <button
                          type='button'
                          onClick={(event) => {
                            event.stopPropagation();
                            setTicketMenuExpanded((value) => !value);
                          }}
                          className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
                            ticketMenuExpanded
                              ? 'bg-white/10 text-(--text-primary)'
                              : 'text-(--text-secondary) hover:bg-white/5 hover:text-(--text-primary)'
                          }`}
                          aria-label='Toggle ticket management submenu'
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${
                              ticketMenuExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    {ticketMenuExpanded && (
                      <div className='mt-2 ml-3 rounded-xl border border-white/8 bg-white/3 p-2 shadow-[0_12px_24px_-18px_rgba(0,0,0,0.45)]'>
                        {[
                          {
                            title: 'Operational Buckets',
                              badge: TICKET_MANAGEMENT_BUCKET_ITEMS.length,
                              items: TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => ({
                                ...item,
                                count:
                                  item.key === 'kpi-customer'
                                    ? ticketManagementOverview?.cards.kpiCustomer.total
                                    : item.key === 'kpi-proactive'
                                      ? ticketManagementOverview?.cards.kpiProactive.total
                                      : item.key === 'non-kpi-unspec'
                                        ? ticketManagementOverview?.cards.nonKpiUnspec.total
                                        : item.key === 'non-technical'
                                          ? ticketManagementOverview?.cards.nonTechnical.total
                                          : item.key === 'sqm-update'
                                            ? ticketManagementOverview?.cards.sqmUpdate.total
                                            : item.key === 'obsolete'
                                              ? ticketManagementOverview?.cards.obsolete.total
                                              : undefined,
                            })),
                          },
                        ].map((section, sectionIndex) => (
                          <div
                            key={section.title}
                            className={clsx(
                              'flex flex-col gap-1',
                              sectionIndex > 0 && 'mt-3 border-t border-white/6 pt-3',
                            )}
                          >
                            <div className='mb-1 flex items-center justify-between px-2'>
                              <p className='text-[10px] font-bold tracking-[1.4px] text-(--text-muted) uppercase'>
                                {section.title}
                              </p>
                              <span className='rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-(--text-secondary)'>
                                {section.badge}
                              </span>
                            </div>
                            {section.items.map((item) => {
                              const subActive = pathname === item.path;
                              return (
                                <div
                                  key={item.path}
                                  onClick={() => handleNavigate(item.path)}
                                  className={`group cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                    subActive
                                      ? 'bg-blue-500/18 text-white ring-1 ring-blue-400/35'
                                      : 'text-(--text-secondary) hover:bg-white/6 hover:text-(--text-primary)'
                                  }`}
                                >
                                  <div className='flex items-center gap-2.5'>
                                    <span className='text-sm'>{item.icon}</span>
                                    <span className='truncate'>{item.label}</span>
                                    {'count' in item && typeof item.count === 'number' && (
                                      <span className='ml-auto rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-(--text-secondary)'>
                                        {item.count}
                                      </span>
                                    )}
                                    {subActive && (
                                      <span className='h-1.5 w-1.5 rounded-full bg-blue-300' />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <NavItem
                    label={item.label}
                    icon={item.icon}
                    active={isActive}
                    onClick={() => handleNavigate(item.path)}
                  />
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className='bg-surface-2 m-3 mt-auto rounded-xl p-3'>
        <div className='flex items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-500 text-sm font-bold text-white'>
            AD
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm leading-tight font-medium text-(--text-primary)'>
              Admin
            </p>
            <p className='text-xs text-(--text-secondary)'>Administrator</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
