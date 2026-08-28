'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/app/hooks/useOptimizations';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import BranchFilterSelect from '@/app/components/ui/BranchFilterSelect';
import SearchToast from '@/app/admin/components/dashboard/SearchToast';
import TopbarNotifications from './TopbarNotifications';
import {
  Search,
  X,
  Menu,
  Sun,
  Moon,
  Plus,
  Filter,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Layers3,
  LayoutDashboard,
  Upload,
  SearchCheck,
  Clock3,
  Loader2,
  MapPinned,
  Layers,
  Wrench,
} from 'lucide-react';
import UserMenu from './user-menu/UserMenu';
import { useTheme } from '@/app/contexts/ThemeContext';

interface Option {
  value: string;
  label: string;
}

interface Props {
  onMenuClick: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onSearch?: (query: string) => void;
  onWorkzoneChange?: (workzone: string) => void;
  selectedWorkzone?: string;
}

type RouteMeta = {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof LayoutDashboard;
};

type SearchToastState = {
  message: string;
  type: 'success' | 'error';
};

const LAST_SEARCH_ROUTE_KEY = 'dompis:last-search-route';

function buildRouteWithoutSearch(
  pathname: string,
  searchParams: URLSearchParams,
) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete('search');
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function getBucketLabelFromPath(path: string): string {
  if (path.startsWith('/admin/ticket-management/kpi-customer'))
    return 'Customer';
  if (path.startsWith('/admin/ticket-management/kpi-proactive'))
    return 'Proactive';
  if (path.startsWith('/admin/ticket-management/non-kpi-unspec'))
    return 'Unspec';
  if (path.startsWith('/admin/ticket-management/non-technical'))
    return 'Non Technical';
  if (path.startsWith('/admin/ticket-management/sqm-update'))
    return 'SQM Update';
  if (path.startsWith('/admin/ticket-management/obsolete')) return 'Obsolete';
  if (path.startsWith('/admin/semesta')) return 'Semesta';
  return 'Overview';
}

function getRouteMeta(pathname: string): RouteMeta {
  if (pathname.startsWith('/admin/rekap-workorder')) {
    return {
      eyebrow: 'Report',
      title: 'Rekap Workorder',
      subtitle:
        'Summary dan detail operasional per bucket, area, serta workzone.',
      badge: 'Workboard',
      icon: BarChart3,
    };
  }
  if (pathname.startsWith('/admin/semesta')) {
    return {
      eyebrow: 'Live Board',
      title: 'Semesta Dompis',
      subtitle:
        'Pantau alur tiket live, status kerja, dan prioritas operasional.',
      badge: 'Live',
      icon: Layers3,
    };
  }
  if (pathname.startsWith('/admin/tools/import-tiket')) {
    return {
      eyebrow: 'Utility',
      title: 'Import Tiket',
      subtitle: 'Alur upload, preview, validasi, dan eksekusi import data.',
      badge: 'Pipeline',
      icon: Upload,
    };
  }
  if (pathname.startsWith('/admin/tools/import-kml')) {
    return {
      eyebrow: 'Utility',
      title: 'Import KML Skema',
      subtitle: 'Upload topologi jaringan sebagai skema overlay War Map.',
      badge: 'Map',
      icon: Layers,
    };
  }
  if (pathname.startsWith('/admin/tools/war-map')) {
    return {
      eyebrow: 'Utility',
      title: 'War Map',
      subtitle: 'Peta sebaran lokasi gangguan (geo-tagged) untuk memonitor titik rawan.',
      badge: 'Map',
      icon: MapPinned,
    };
  }
  if (pathname.startsWith('/admin/tools')) {
    return {
      eyebrow: 'Utilities',
      title: 'Tools',
      subtitle: 'Kumpulan utilitas & peta untuk operasional lapangan.',
      badge: 'Tools',
      icon: Wrench,
    };
  }
  if (pathname.startsWith('/admin/monitoring')) {
    return {
      eyebrow: 'Monitoring',
      title: 'Monitoring Durasi',
      subtitle: 'Ringkasan health service, SLA, dan performa operasional.',
      badge: 'Health',
      icon: Clock3,
    };
  }
  if (pathname.startsWith('/admin/detail-wo-hi')) {
    return {
      eyebrow: 'Investigation',
      title: 'Detail WO HI',
      subtitle:
        'Tampilan detail yang tenang untuk investigasi tiket dan timeline.',
      badge: 'Forensic',
      icon: SearchCheck,
    };
  }

  return {
    eyebrow: 'Control Room',
    title: 'Ticket Management',
    subtitle:
      'Ringkasan bucket operasional, fokus queue, dan distribusi workzone.',
    badge: 'Overview',
    icon: LayoutDashboard,
  };
}

export default function Topbar({
  onMenuClick,
  onToggleSidebar,
  sidebarCollapsed = false,
  onSearch,
  onWorkzoneChange,
  selectedWorkzone,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchToast, setSearchToast] = useState<SearchToastState | null>(null);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [workzone, setWorkzone] = useState(selectedWorkzone || '');
  const { branch } = usePersistentBranchScope();
  const debouncedSearch = useDebounce(searchValue, 500);
  const { isDark, toggleTheme } = useTheme();
  const { options: workzoneOptions, loading: workzoneLoading } =
    useWorkzoneOptions(branch || undefined);
  const urlSearch = searchParams.get('search') || '';
  const isLocalSearch = typeof onSearch === 'function';
  const meta = useMemo(() => getRouteMeta(pathname), [pathname]);
  const currentRouteWithoutSearch = useMemo(
    () => buildRouteWithoutSearch(pathname, searchParams),
    [pathname, searchParams],
  );

  useEffect(() => {
    setWorkzone(selectedWorkzone || '');
  }, [selectedWorkzone]);

  useEffect(() => {
    if (workzoneLoading || !branch) return;
    const valid = workzoneOptions.some((opt) => opt.value === workzone);
    if (workzone && !valid) {
      setWorkzone('');
      onWorkzoneChange?.('');
    }
  }, [branch, workzone, workzoneOptions, workzoneLoading, onWorkzoneChange]);

  useEffect(() => {
    setSearchValue(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlSearch.trim()) return;
    window.sessionStorage.setItem(
      LAST_SEARCH_ROUTE_KEY,
      currentRouteWithoutSearch,
    );
  }, [currentRouteWithoutSearch, urlSearch]);

  const navigateToSearch = useCallback(
    async (q: string) => {
      if (isLocalSearch) {
        onSearch?.(q);
        return;
      }
      if (!q.trim()) return;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          LAST_SEARCH_ROUTE_KEY,
          currentRouteWithoutSearch,
        );
      }
      setIsSearching(true);
      setSearchToast(null);
      try {
        const res = await fetch(
          `/api/tickets/search-global?q=${encodeURIComponent(q)}`,
          { cache: 'no-store' },
        );
        const result = await res.json();
        if (result.found) {
          const targetPath =
            typeof result.path === 'string' && result.path.trim().length > 0
              ? result.path
              : result.page === 'admin'
                ? '/admin'
                : '/admin/semesta';
          const separator = targetPath.includes('?') ? '&' : '?';
          const tabParam =
            typeof result.tab === 'string' && result.tab.trim().length > 0
              ? `&tab=${encodeURIComponent(result.tab)}`
              : '';
          setSearchToast({
            type: 'success',
            message: `Ditemukan di ${getBucketLabelFromPath(targetPath)}.`,
          });
          await router.push(
            `${targetPath}${separator}search=${encodeURIComponent(q)}${tabParam}`,
          );
        } else {
          setSearchToast({
            type: 'error',
            message: 'Tidak ditemukan.',
          });
        }
      } catch {
        setSearchToast({
          type: 'error',
          message: 'Pencarian gagal.',
        });
      }
      setIsSearching(false);
    },
    [
      currentRouteWithoutSearch,
      isLocalSearch,
      onSearch,
      pathname,
      router,
      searchParams,
    ],
  );

  useEffect(() => {
    const q = debouncedSearch.trim();
    const liveQuery = searchValue.trim();
    if (isLocalSearch) {
      onSearch?.(q);
      return;
    }
    if (!q) return;
    if (!liveQuery) return;
    if (q === urlSearch.trim()) return;

    navigateToSearch(q);
  }, [debouncedSearch, isLocalSearch, navigateToSearch, onSearch, searchValue, urlSearch]);

  const clearGlobalSearchUrl = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LAST_SEARCH_ROUTE_KEY);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const nextUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.replace(nextUrl);
  }, [pathname, router, searchParams]);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (value.trim()) return;

      setSearchToast(null);
      if (isLocalSearch) {
        onSearch?.('');
        return;
      }

      clearGlobalSearchUrl();
    },
    [
      clearGlobalSearchUrl,
      isLocalSearch,
      onSearch,
      pathname,
    ],
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchValue.trim();
      if (isLocalSearch) {
        onSearch?.(q);
        return;
      }
      navigateToSearch(q);
    },
    [isLocalSearch, navigateToSearch, onSearch, searchValue],
  );

  const clearSearch = () => {
    setSearchValue('');
    setSearchToast(null);
    if (isLocalSearch) {
      onSearch?.('');
      return;
    }
    clearGlobalSearchUrl();
  };

  const handleWorkzoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setWorkzone(value);
    onWorkzoneChange?.(value);
  };

  const selectedScopeLabel = selectedWorkzone || 'All workzone';

  return (
    <>
      <header className='bg-bg/90 sticky top-0 z-30 border-b border-(--border) backdrop-blur-xl'>
        <div className='flex flex-col gap-3 px-3 py-3 lg:px-6 lg:py-4'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <button
                onClick={onMenuClick}
                className='bg-surface hover:bg-surface-2 rounded-xl border border-(--border) px-2.5 py-2 text-(--text-secondary) transition-colors lg:hidden'
                title='Open menu'
              >
                <Menu className='h-5 w-5' />
              </button>

              <button
                onClick={onToggleSidebar}
                className='bg-surface hover:bg-surface-2 hidden rounded-xl border border-(--border) px-2.5 py-2 text-(--text-secondary) transition-colors lg:block'
                title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className='h-5 w-5' />
                ) : (
                  <Menu className='h-5 w-5' />
                )}
              </button>

              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <meta.icon className='h-4 w-4 text-(--text-muted)' />
                  <h1 className='truncate text-lg font-semibold tracking-tight text-(--text-primary) lg:text-xl'>
                    {meta.title}
                  </h1>
                </div>
                <p className='mt-1 hidden max-w-3xl truncate text-xs text-(--text-secondary) lg:block'>
                  {meta.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center'>
            <form onSubmit={handleSearch} className='relative min-w-0'>
              <div className='relative flex items-center rounded-2xl border border-(--border) bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.45))] px-3 py-2.5 shadow-sm dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(15,23,42,0.72))]'>
                <Search className='pointer-events-none h-4 w-4 text-(--text-muted)' />
                <input
                  type='text'
                  placeholder='Cari ticket, customer, incident, atau service no...'
                  value={searchValue}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  className='ml-3 min-w-0 flex-1 bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none'
                />
                {searchValue && (
                  <button
                    type='button'
                    onClick={clearSearch}
                    className='hover:bg-surface-2 ml-2 rounded-lg p-1.5 text-(--text-muted) transition-colors hover:text-(--text-primary)'
                    aria-label='Clear search'
                  >
                    <X className='h-4 w-4' />
                  </button>
                )}
                <span className='bg-surface ml-2 hidden rounded-lg border border-(--border) px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase xl:inline-flex'>
                  Enter
                </span>
              </div>
            </form>

            <div className='flex flex-wrap items-center justify-end gap-1.5'>
              <BranchFilterSelect />
              <button
                type='button'
                onClick={() => setShowMobileFilters((v) => !v)}
                className='bg-surface hover:bg-surface-2 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-(--border) px-3 py-2.5 text-(--text-secondary) shadow-sm transition-colors lg:hidden'
                aria-label='Toggle filters'
                aria-expanded={showMobileFilters}
                title='Filter workzone'
              >
                <Filter className='h-4 w-4' />
                <span className='hidden text-xs font-semibold sm:inline'>Filter</span>
              </button>
              <TopbarNotifications selectedWorkzone={workzone || undefined} />

              <div className='relative hidden lg:block xl:block'>
                <select
                  value={workzone}
                  onChange={handleWorkzoneChange}
                  disabled={workzoneLoading}
                  className='bg-surface hover:bg-surface-2 appearance-none rounded-2xl border border-(--border) px-4 py-2.5 pr-10 text-sm text-(--text-primary) shadow-sm transition-colors focus:border-blue-500 focus:outline-none'
                >
                  <option value=''>All Workzone</option>
                  {workzoneOptions.map((option: Option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className='pointer-events-none absolute top-3 right-3 h-4 w-4 text-(--text-muted)' />
              </div>

              <button
                onClick={toggleTheme}
                className='bg-surface hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-(--border) px-3 py-2.5 text-(--text-secondary) shadow-sm transition-colors'
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <Sun className='h-4 w-4 text-amber-400' />
                ) : (
                  <Moon className='h-4 w-4 text-slate-600' />
                )}
                {/* <span className='hidden text-sm font-semibold sm:inline'>
                  Theme
                </span> */}
              </button>

              <button className='hidden items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,rgba(59,130,246,0.98),rgba(99,102,241,0.95))] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 lg:inline-flex'>
                <Plus className='h-4 w-4' />
                <span>New Ticket</span>
              </button>

              <div className='flex items-center justify-end'>
                <UserMenu profileHref='/admin/profile' />
              </div>
            </div>
          </div>
        </div>

        {showMobileFilters && (
          <div className='bg-surface border-t border-(--border) px-3 py-3 lg:hidden'>
            <div className='flex flex-col gap-3'>
              <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                <div className='bg-surface-2 rounded-2xl border border-(--border) px-3 py-2.5'>
                  <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase'>
                    Scope
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {selectedScopeLabel}
                  </p>
                </div>
                <div className='bg-surface-2 rounded-2xl border border-(--border) px-3 py-2.5'>
                  <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase'>
                    Search mode
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {isLocalSearch ? 'Local page filter' : 'Global search'}
                  </p>
                </div>
              </div>
              <input
                type='text'
                placeholder='Cari ticket, customer...'
                value={searchValue}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                className='bg-surface-2 w-full rounded-2xl border border-(--border) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted)'
              />
              <select
                value={workzone}
                onChange={handleWorkzoneChange}
                className='bg-surface-2 w-full rounded-2xl border border-(--border) px-3 py-2.5 text-sm text-(--text-primary)'
              >
                <option value=''>All Workzone</option>
                {workzoneOptions.map((option: Option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {showMobileSearch && (
          <div
            className='fixed inset-0 z-50 bg-black/50 lg:hidden'
            onClick={() => setShowMobileSearch(false)}
          >
            <div
              className='bg-surface fixed inset-x-0 top-0 z-50 border-b border-(--border) p-4 shadow-2xl'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center gap-3'>
                <div className='relative flex-1'>
                  <input
                    type='text'
                    placeholder='Cari ticket, customer...'
                    value={searchValue}
                    onChange={(e) => handleSearchInputChange(e.target.value)}
                    autoFocus
                    className='bg-surface-2 w-full rounded-2xl border border-(--border) px-4 py-3 pl-10 text-sm text-(--text-primary) placeholder:text-(--text-muted)'
                  />
                  <Search className='pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-(--text-muted)' />
                </div>
                {searchValue && (
                  <button
                    type='button'
                    onClick={clearSearch}
                    className='bg-surface-2 rounded-2xl border border-(--border) p-3 text-(--text-secondary)'
                  >
                    <X className='h-4 w-4' />
                  </button>
                )}
                <button
                  onClick={() => {
                    const q = searchValue.trim();
                    if (isLocalSearch) {
                      onSearch?.(q);
                      setShowMobileSearch(false);
                      return;
                    }
                    navigateToSearch(q);
                    setShowMobileSearch(false);
                  }}
                  className='rounded-2xl bg-[linear-gradient(135deg,rgba(59,130,246,0.98),rgba(99,102,241,0.95))] px-4 py-3 text-sm font-semibold text-white'
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {isSearching && !isLocalSearch && (
        <div className='fixed inset-0 z-9999 flex items-center justify-center bg-black/30'>
          <div className='bg-surface flex min-w-72 items-center gap-3 rounded-2xl border border-(--border) px-5 py-4 shadow-2xl'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-(--surface-2) text-(--text-secondary)'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
            <div className='min-w-0'>
              <p className='text-sm font-semibold text-(--text-primary)'>
                Mencari tiket
              </p>
              <p className='truncate text-xs text-(--text-secondary)'>
                Menelusuri data tiket yang cocok dengan kata kunci Anda.
              </p>
            </div>
          </div>
        </div>
      )}

      {searchToast && (
        <SearchToast
          message={searchToast.message}
          type={searchToast.type}
          onDismiss={() => setSearchToast(null)}
        />
      )}
    </>
  );
}
