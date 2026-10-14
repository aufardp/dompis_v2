'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/app/libs/utils';
import { ChevronDown, Check } from 'lucide-react';

export function CheckboxDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (key: string) => {
    if (key === 'all') {
      onChange(['all']);
      return;
    }
    const filtered = selected.filter((k) => k !== 'all');
    const next = filtered.includes(key)
      ? filtered.filter((k) => k !== key)
      : [...filtered, key];

    onChange(next.length === 0 ? ['all'] : next);
  };

  const displayLabel = selected.includes('all')
    ? 'Semua'
    : `${selected.length} Terpilih`;

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-40 px-3 py-2 text-xs font-semibold bg-surface-2 border border-(--border) rounded-lg hover:border-blue-400/40 text-(--text-primary)"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-(--text-secondary)" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 z-[100] bg-(--surface) border border-(--border) rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.key);
              return (
                <div
                  key={opt.key}
                  onClick={() => toggleOption(opt.key)}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-(--surface-2) cursor-pointer text-xs transition"
                >
                  <div
                    className={cn(
                      'w-3.5 h-3.5 border rounded flex items-center justify-center transition',
                      isSelected
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-(--border)',
                    )}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <span
                    className={cn(
                      'truncate',
                      isSelected ? 'text-(--text-primary) font-semibold' : 'text-(--text-muted)',
                    )}
                  >
                    {opt.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
