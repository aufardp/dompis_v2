'use client';

import { useEffect, useRef, useState } from 'react';
import { Filter, ChevronDown, Check } from 'lucide-react';
import {
  OPERATIONAL_BUCKET_DEFINITIONS,
  type OperationalBucketKey,
} from '@/app/config/operational-buckets';

const BUCKET_ORDER: OperationalBucketKey[] = [
  'kpi_customer',
  'kpi_proactive',
  'non_kpi_unspec',
  'non_technical',
  'sqm_update',
  'obsolete',
];

export default function AutoAssignBucketFilter({
  selected,
  onChange,
}: {
  selected: OperationalBucketKey[];
  onChange: (buckets: OperationalBucketKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const label =
    selected.length === 0
      ? 'Semua Bucket'
      : `${selected.length} Bucket dipilih`;

  const toggleBucket = (key: OperationalBucketKey) => {
    onChange(
      selected.includes(key)
        ? selected.filter((b) => b !== key)
        : [...selected, key],
    );
  };

  return (
    <div className='relative' ref={containerRef}>
      <button
        type='button'
        onClick={() => setOpen((prev) => !prev)}
        className='flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--surface-2)'
      >
        <Filter className='h-3.5 w-3.5 text-(--text-muted)' />
        {label}
        <ChevronDown className='h-3.5 w-3.5 text-(--text-muted)' />
      </button>

      {open && (
        <div className='absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-(--border) bg-(--surface) shadow-lg'>
          <button
            type='button'
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className='flex w-full items-center justify-between border-b border-(--border) px-3 py-2 text-left text-sm font-semibold text-(--text-primary) hover:bg-(--surface-2)'
          >
            Semua Bucket
            {selected.length === 0 && <Check className='h-3.5 w-3.5' />}
          </button>
          <div className='max-h-72 overflow-y-auto py-1'>
            {BUCKET_ORDER.map((key) => {
              const isSelected = selected.includes(key);
              return (
                <button
                  key={key}
                  type='button'
                  onClick={() => toggleBucket(key)}
                  className='flex w-full items-center justify-between px-3 py-2 text-left text-sm text-(--text-secondary) hover:bg-(--surface-2)'
                >
                  <span
                    className={
                      isSelected ? 'font-medium text-(--text-primary)' : ''
                    }
                  >
                    {OPERATIONAL_BUCKET_DEFINITIONS[key].label}
                  </span>
                  {isSelected && <Check className='h-3.5 w-3.5 text-blue-500' />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
