'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

type MenuIcon = ComponentType<{ className?: string }>;

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
  rightSlot?: ReactNode;
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
      aria-label='Toggle submenu'
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

interface ExpandableMenuGroupProps {
  label: string;
  hint: string;
  path: string;
  icon: MenuIcon;
  openPathPrefixes?: string[];
  onNavigate: (path: string) => void;
  children: ReactNode;
  count?: number;
}

export default function ExpandableMenuGroup({
  label,
  hint,
  path,
  icon,
  openPathPrefixes = [],
  onNavigate,
  children,
  count,
}: ExpandableMenuGroupProps) {
  const pathname = usePathname();
  const isActive =
    pathname === path || pathname.startsWith(path);
  const autoOpen =
    pathname === path ||
    openPathPrefixes.some((prefix) => pathname.startsWith(prefix));

  const [expanded, setExpanded] = useState(autoOpen);

  useEffect(() => {
    if (autoOpen) {
      setExpanded(true);
    }
  }, [autoOpen]);

  return (
    <div className='space-y-2'>
      <div className='relative'>
        <NavButton
          label={label}
          hint={hint}
          icon={icon}
          active={isActive}
          onClick={() => onNavigate(path)}
          rightSlot={
            <SectionToggle
              expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
            />
          }
        />
      </div>

      {expanded && (
        <div className='ml-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-white/8 dark:bg-black/10'>
          {typeof count === 'number' && (
            <div className='mb-2 flex items-center justify-between gap-2 px-1'>
              <p className='text-[10px] font-bold tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400'>
                {label}
              </p>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-200'>
                {count}
              </span>
            </div>
          )}
          <div className='grid gap-1.5'>{children}</div>
        </div>
      )}
    </div>
  );
}

export { SubmenuButton };

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