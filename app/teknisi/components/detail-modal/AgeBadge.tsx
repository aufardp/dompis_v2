import { getTicketAgeColor, calculateTicketAge } from '@/app/utils/datetime';

interface AgeBadgeProps {
  reportedDate: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  className?: string;
}

export default function AgeBadge({
  reportedDate,
  hasilVisit,
  closedAt,
  className = '',
}: AgeBadgeProps) {
  const color = getTicketAgeColor(reportedDate, hasilVisit, closedAt);

  const colorMap: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium sm:px-2.5 sm:py-1 sm:text-sm ${colorMap[color]} ${className}`}
    >
      {calculateTicketAge(reportedDate, hasilVisit, closedAt)}
    </span>
  );
}
