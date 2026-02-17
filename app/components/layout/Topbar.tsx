'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/app/hooks/useOptimizations';
import { Search, X, Menu } from 'lucide-react';
import UserMenu from './user-menu/UserMenu';

interface Props {
  onMenuClick: () => void;
  onSearch?: (query: string) => void;
}

export default function Topbar({ onMenuClick, onSearch }: Props) {
  const [searchValue, setSearchValue] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const debouncedSearch = useDebounce(searchValue, 500);

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

  return (
    <header className='flex h-16 items-center justify-between border-b bg-white px-4 md:px-8'>
      <div className='flex items-center gap-2 md:gap-4'>
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className='rounded-lg p-2 hover:bg-slate-100 lg:hidden'
        >
          <Menu className='h-6 w-6' />
        </button>

        {/* Mobile Search Button */}
        <button
          onClick={() => setShowMobileSearch(true)}
          className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50 md:hidden'
        >
          <Search className='h-5 w-5 text-slate-600' />
        </button>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className='hidden md:block'>
          <div className='relative'>
            <input
              type='text'
              placeholder='Search ticket, customer, service no...'
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className='focus:border-primary w-64 rounded-lg border border-slate-200 bg-white px-4 py-2 pl-10 text-sm focus:outline-none lg:w-96'
            />
            <svg
              className='absolute top-2.5 left-3 h-5 w-5 text-slate-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
              />
            </svg>
          </div>
        </form>
      </div>

      <div className='flex items-center gap-3'>
        <UserMenu profileHref='/admin/profile' />
      </div>

      {/* Mobile Search Modal */}
      {showMobileSearch && (
        <div
          className='fixed inset-0 z-50 bg-black/50 md:hidden'
          onClick={() => setShowMobileSearch(false)}
        >
          <div
            className='fixed inset-x-0 top-0 bg-white p-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center gap-3'>
              <div className='relative flex-1'>
                <input
                  type='text'
                  placeholder='Search ticket, customer, service no...'
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  autoFocus
                  className='w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pl-10 text-sm focus:border-blue-500 focus:outline-none'
                />
                <Search className='absolute top-2.5 left-3 h-5 w-5 text-slate-400' />
              </div>
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className='rounded-lg p-2 hover:bg-slate-100'
                >
                  <X className='h-5 w-5 text-slate-600' />
                </button>
              )}
              <button
                onClick={() => {
                  onSearch?.(searchValue);
                  setShowMobileSearch(false);
                }}
                className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
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
