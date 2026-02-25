'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export type AdminAccordionItem = {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

type AdminAccordionProps = {
  items: AdminAccordionItem[];
  storageKey?: string;
  multiple?: boolean;
  className?: string;
};

function safeParseStoredIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((v) => typeof v === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function AdminAccordion({
  items,
  storageKey,
  multiple = true,
  className,
}: AdminAccordionProps) {
  const idsKey = useMemo(() => items.map((i) => i.id).join('|'), [items]);
  const validIds = useMemo(() => new Set(items.map((i) => i.id)), [idsKey]);

  const defaultOpenIds = useMemo(() => {
    return items.filter((i) => i.defaultOpen).map((i) => i.id);
  }, [items]);

  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(defaultOpenIds),
  );

  useEffect(() => {
    if (!storageKey) return;
    const stored = safeParseStoredIds(window.localStorage.getItem(storageKey));
    if (!stored) return;
    const next = stored.filter((id) => validIds.has(id));
    setOpenIds(new Set(next));
  }, [idsKey, storageKey, validIds]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify([...openIds]));
  }, [openIds, storageKey]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      const isOpen = next.has(id);
      if (multiple) {
        if (isOpen) next.delete(id);
        else next.add(id);
        return next;
      }

      if (isOpen) return new Set();
      return new Set([id]);
    });
  };

  return (
    <div className={clsx('space-y-3 md:space-y-4', className)}>
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        const buttonId = `admin-acc-btn-${item.id}`;
        const panelId = `admin-acc-panel-${item.id}`;

        return (
          <div
            key={item.id}
            className='bg-surface overflow-hidden rounded-2xl border border-[var(--border)]'
          >
            <button
              id={buttonId}
              type='button'
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={clsx(
                'bg-surface-2 hover:bg-surface-3 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors md:px-5 md:py-3.5',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
              )}
            >
              <div className='flex min-w-0 items-center gap-2.5'>
                {item.icon && (
                  <span className='grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-sm'>
                    {item.icon}
                  </span>
                )}
                <div className='min-w-0'>
                  <div className='truncate text-xs font-bold tracking-[1.5px] text-[var(--text-secondary)] uppercase'>
                    {item.title}
                  </div>
                </div>
              </div>

              <div className='flex items-center gap-3'>
                {item.right && (
                  <div className='shrink-0 text-xs text-[var(--text-muted)]'>
                    {item.right}
                  </div>
                )}
                <ChevronDown
                  size={18}
                  className={clsx(
                    'shrink-0 text-[var(--text-muted)] transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
              </div>
            </button>

            <div
              id={panelId}
              role='region'
              aria-labelledby={buttonId}
              className={clsx(
                'grid transition-[grid-template-rows] duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className='min-h-0 overflow-hidden'>
                <div className='px-4 py-4 md:px-5 md:py-5'>{item.children}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
