'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { CustomerType } from '@/app/types/ticket';
import type { TicketCtype } from '@/app/types/ticket';

export function StatusBadge({
  label,
  color,
  bg,
  dot,
}: {
  label: string;
  color: string;
  bg: string;
  dot: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${bg} ${color} border px-2.5 py-0.5 text-[11px] font-semibold shadow-xs`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent */
    }
  };

  return (
    <button
      type='button'
      onClick={onCopy}
      title={label}
      className='rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function CTypeBadge({ ctype }: { ctype?: TicketCtype }) {
  const config = ctype ? CustomerType[ctype] : null;

  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${config.bg} ${config.color}`}
    >
      {config.icon && <span className='text-[10px]'>{config.icon}</span>}
      {config.label}
    </span>
  );
}
