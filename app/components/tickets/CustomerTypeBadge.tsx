'use client';

import { TicketCtype, CustomerType } from '@/app/types/ticket';

interface CustomerTypeBadgeProps {
  ctype: TicketCtype | undefined;
  size?: 'sm' | 'md';
}

export default function CustomerTypeBadge({
  ctype,
  size = 'md',
}: CustomerTypeBadgeProps) {
  if (!ctype || !CustomerType[ctype]) {
    return <span className='text-xs text-gray-400'>-</span>;
  }

  const config = CustomerType[ctype];
  const sizeClasses =
    size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bg} ${config.color} ${sizeClasses}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
