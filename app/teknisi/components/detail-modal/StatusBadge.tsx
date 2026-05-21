interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Definisikan tipe status yang valid (case-insensitive berkat normalisasi nanti)
type StatusKey =
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'CLOSE'
  | 'CLOSED'
  | 'OPEN'
  | 'ESCALATED';

interface BadgeStyle {
  badge: string;
  dot: string;
  label: string;
}

const STATUS_MAP: Record<StatusKey | 'DEFAULT', BadgeStyle> = {
  ASSIGNED: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200/70',
    dot: 'bg-amber-500',
    label: 'Assigned',
  },
  ON_PROGRESS: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200/70',
    dot: 'bg-blue-500',
    label: 'On Progress',
  },
  PENDING: {
    badge: 'bg-purple-50 text-purple-700 border-purple-200/70',
    dot: 'bg-purple-500',
    label: 'Pending',
  },
  CLOSE: {
    badge: 'bg-green-50 text-green-700 border-green-200/70',
    dot: 'bg-green-500',
    label: 'Closed',
  },
  CLOSED: {
    badge: 'bg-green-50 text-green-700 border-green-200/70',
    dot: 'bg-green-500',
    label: 'Closed',
  },
  OPEN: {
    badge: 'bg-gray-50 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
    label: 'Open',
  },
  ESCALATED: {
    badge:
      'bg-rose-50 text-rose-700 border-rose-200/70 shadow-sm shadow-rose-50',
    dot: 'bg-rose-500 animate-pulse', // Efek berkedip untuk eskalasi
    label: 'Escalated',
  },
  DEFAULT: {
    badge: 'bg-gray-50 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
    label: 'Unknown',
  },
};

export default function StatusBadge({
  status,
  className = '',
}: StatusBadgeProps) {
  // Normalisasi string: bersihkan spasi, ubah ke UPPERCASE untuk kecocokan konstan
  const cleanKey = (status ?? '').trim().toUpperCase() as StatusKey;

  // Ambil style berdasarkan key, atau gunakan DEFAULT jika tidak terdaftar
  const currentStyle = STATUS_MAP[cleanKey] || STATUS_MAP.DEFAULT;

  // Jika status tidak dikenali, tampilkan teks aslinya sebagai fallback aman
  const displayLabel = STATUS_MAP[cleanKey] ? currentStyle.label : status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all duration-200 ease-in-out ${currentStyle.badge} ${className} `}
    >
      {/* Indikator Titik Status */}
      <span className={`h-1.5 w-1.5 rounded-full ${currentStyle.dot}`} />

      {/* Label Status */}
      <span>{displayLabel}</span>
    </span>
  );
}
