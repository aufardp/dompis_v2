'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/app/hooks/useOptimizations';
import { useWorkzoneOptions } from '@/app/hooks/useDropdownOptions';
import {
  Search,
  X,
  Menu,
  Sun,
  Moon,
  Plus,
  Filter,
  ChevronDown,
} from 'lucide-react';
import UserMenu from './user-menu/UserMenu';
import { useTheme } from '@/app/contexts/ThemeContext';

interface Option {
  value: string;
  label: string;
}

interface Props {
  onMenuClick: () => void;
  onSearch?: (query: string) => void;
  onWorkzoneChange?: (workzone: string) => void;
  selectedWorkzone?: string;
}

export default function Topbar({
  onMenuClick,
  onSearch,
  onWorkzoneChange,
  selectedWorkzone,
}: Props) {
  const [searchValue, setSearchValue] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [workzone, setWorkzone] = useState(selectedWorkzone || '');
  const debouncedSearch = useDebounce(searchValue, 500);
  const { isDark, toggleTheme } = useTheme();
  const { options: workzoneOptions, loading: workzoneLoading } =
    useWorkzoneOptions();

  useEffect(() => {
    if (onSearch) {
      onSearch(debouncedSearch);
    }
  }, [debouncedSearch, onSearch]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSearch?.(searchValue);
    },
    [onSearch, searchValue],
  );

  const clearSearch = () => {
    setSearchValue('');
    onSearch?.('');
  };

  const handleWorkzoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setWorkzone(value);
    onWorkzoneChange?.(value);
  };

  return (
    <header className='bg-bg/95 sticky top-0 z-30 flex flex-col border-b border-(--border) backdrop-blur-sm'>
      {/* Main Topbar Row */}
      <div className='flex h-14 items-center justify-between px-3 py-2 lg:px-6 lg:py-3'>
        <div className='flex items-center gap-2'>
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className='hover:bg-surface-2 rounded-lg p-2 lg:hidden'
          >
            <Menu className='h-5 w-5 text-(--text-secondary)' />
          </button>

          {/* Page Title - Desktop */}
          <h1 className='font-syne hidden text-lg font-bold tracking-tight text-(--text-primary) lg:block'>
            Ticket Management
          </h1>

          {/* Page Title - Mobile */}
          <h1 className='font-syne text-base font-bold tracking-tight text-(--text-primary) lg:hidden'>
            Dompis
          </h1>
        </div>

        <div className='flex items-center gap-1 lg:gap-2'>
          {/* Mobile Search Button */}
          <button
            onClick={() => setShowMobileSearch(true)}
            className='bg-surface-2 hover:bg-surface-3 rounded-lg p-2 lg:hidden'
          >
            <Search className='h-4 w-4 text-(--text-secondary)' />
          </button>

          {/* Mobile Filter Button */}
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className='bg-surface-2 hover:bg-surface-3 rounded-lg p-2 lg:hidden'
          >
            <Filter className='h-4 w-4 text-(--text-secondary)' />
          </button>

          {/* Desktop Search */}
          <form onSubmit={handleSearch} className='hidden lg:block'>
            <div className='relative'>
              <input
                type='text'
                placeholder='Search ticket, customer...'
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className='bg-surface-2 w-64 rounded-lg border border-(--border) px-4 py-2 pl-10 text-sm text-(--text-primary) placeholder:text-(--text-secondary) focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none xl:w-80'
              />
              <Search className='absolute top-2.5 left-3 h-4 w-4 text-(--text-secondary)' />
            </div>
          </form>

          {/* Desktop Workzone Select */}
          <div className='relative hidden lg:block'>
            <select
              value={workzone}
              onChange={handleWorkzoneChange}
              disabled={workzoneLoading}
              className='bg-surface-2 cursor-pointer appearance-none rounded-lg border border-(--border) px-3 py-2 pr-8 text-sm text-(--text-secondary) focus:border-blue-500 focus:outline-none'
            >
              <option value=''>All Workzone</option>
              {workzoneOptions.map((option: Option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className='pointer-events-none absolute top-2.5 right-2 h-4 w-4 text-(--text-secondary)' />
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className='bg-surface-2 hover:bg-surface-3 rounded-lg border border-(--border) p-2 transition-colors'
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className='h-4 w-4 text-amber-400' />
            ) : (
              <Moon className='h-4 w-4 text-slate-600' />
            )}
          </button>

          {/* New Ticket Button */}
          <button className='flex items-center gap-1.5 rounded-lg bg-linear-to-r from-blue-500 to-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 lg:px-4'>
            <Plus className='h-4 w-4' />
            <span className='hidden lg:inline'>New Ticket</span>
          </button>

          {/* User Menu */}
          <UserMenu profileHref='/admin/profile' />
        </div>
      </div>

      {/* Mobile Filters Row */}
      {showMobileFilters && (
        <div className='bg-surface flex flex-col gap-2 border-t border-(--border) p-3 lg:hidden'>
          <input
            type='text'
            placeholder='Search...'
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-secondary)'
          />
          <select
            value={workzone}
            onChange={handleWorkzoneChange}
            className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-secondary)'
          >
            <option value=''>All Workzone</option>
            {workzoneOptions.map((option: Option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mobile Search Modal */}
      {showMobileSearch && (
        <div
          className='fixed inset-0 z-50 bg-black/50 lg:hidden'
          onClick={() => setShowMobileSearch(false)}
        >
          <div
            className='bg-surface fixed inset-x-0 top-0 z-50 p-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center gap-3'>
              <div className='relative flex-1'>
                <input
                  type='text'
                  placeholder='Search ticket, customer...'
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  autoFocus
                  className='bg-surface-2 w-full rounded-lg border border-(--border) px-4 py-2 pl-10 text-sm text-(--text-primary) placeholder:text-(--text-secondary)'
                />
                <Search className='absolute top-2.5 left-3 h-5 w-5 text-(--text-secondary)' />
              </div>
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className='hover:bg-surface-2 rounded-lg p-2'
                >
                  <X className='h-5 w-5 text-(--text-secondary)' />
                </button>
              )}
              <button
                onClick={() => {
                  onSearch?.(searchValue);
                  setShowMobileSearch(false);
                }}
                className='rounded-lg bg-linear-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white'
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
