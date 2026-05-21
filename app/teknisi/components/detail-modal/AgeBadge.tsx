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

  // Mapping warna dengan kombinasi background, text, border, dan warna dot (titik)
  const colorMap: Record<string, { badge: string; dot: string }> = {
    green: {
      badge: 'bg-green-50 text-green-700 border-green-200/60',
      dot: 'bg-green-500',
    },
    yellow: {
      badge: 'bg-yellow-50 text-yellow-700 border-yellow-200/60',
      dot: 'bg-yellow-500',
    },
    orange: {
      badge: 'bg-orange-50 text-orange-700 border-orange-200/60',
      dot: 'bg-orange-500',
    },
    red: {
      badge:
        'bg-red-50 text-red-700 border-red-200/60 shadow-sm shadow-red-100',
      dot: 'bg-red-500 animate-pulse', // Efek berkedip khusus untuk status merah/kritis
    },
    gray: {
      badge: 'bg-gray-50 text-gray-600 border-gray-200',
      dot: 'bg-gray-400',
    },
  };

  // Gunakan warna gray sebagai fallback jika warna tidak ditemukan
  const currentStyles = colorMap[color] || colorMap.gray;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all duration-200 ease-in-out ${currentStyles.badge} ${className} `}
    >
      {/* Indikator titik kecil di dalam badge */}
      <span className={`h-1.5 w-1.5 rounded-full ${currentStyles.dot}`} />

      {/* Teks Umur Tiket */}
      <span>{calculateTicketAge(reportedDate, hasilVisit, closedAt)}</span>
    </span>
  );
}
