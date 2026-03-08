interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  // STATUS_UPDATE lowercase values (single source of truth)
  assigned: 'bg-amber-100 text-amber-700',
  on_progress: 'bg-blue-100 text-blue-700',
  pending: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-700',
  open: 'bg-gray-100 text-gray-700',
  escalated: 'bg-rose-100 text-rose-700',
  // Legacy HASIL_VISIT uppercase values (fallback)
  ASSIGNED: 'bg-amber-100 text-amber-700',
  ON_PROGRESS: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-purple-100 text-purple-700',
  CLOSE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-green-100 text-green-700',
  OPEN: 'bg-gray-100 text-gray-700',
  ESCALATED: 'bg-rose-100 text-rose-700',
};

export default function StatusBadge({
  status,
  className = '',
}: StatusBadgeProps) {
  const key = (status ?? '').trim().toUpperCase();
  const colorClass = STATUS_COLORS[key] || 'bg-gray-100 text-gray-700';

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium sm:px-3 sm:text-sm ${colorClass} ${className}`}
    >
      {status}
    </span>
  );
}
