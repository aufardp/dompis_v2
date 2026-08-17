'use client';

import { useEffect } from 'react';
import { useBranchOptions } from '@/app/hooks/useDropdownOptions';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import { ChevronDown } from 'lucide-react';

interface Props {
  initialBranch?: string;
  className?: string;
}

export default function BranchFilterSelect({ initialBranch, className = '' }: Props) {
  const { options, loading } = useBranchOptions();
  const { branch, setBranch } = usePersistentBranchScope(initialBranch);

  useEffect(() => {
    if (!loading && options.length === 0 && branch) {
      setBranch('');
    }
  }, [loading, options.length, branch, setBranch]);

  if (!loading && options.length === 0) return null;

  return (
    <div className={`relative ${className}`}>
      <select
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        disabled={loading}
        className='bg-surface hover:bg-surface-2 appearance-none rounded-2xl border border-(--border) px-4 py-2.5 pr-10 text-sm text-(--text-primary) shadow-sm transition-colors focus:border-blue-500 focus:outline-none'
        title='Filter branch'
      >
        <option value=''>All Branch</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className='pointer-events-none absolute top-3 right-3 h-4 w-4 text-(--text-muted)' />
    </div>
  );
}
