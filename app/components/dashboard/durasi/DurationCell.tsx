interface DurationCellProps {
  value: number | null;
  bucketIndex: number;
  onClick?: () => void;
  ariaLabel?: string;
}

const CELL_COLORS = [
  'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  'bg-lime-50 text-lime-800 dark:bg-lime-950/30 dark:text-lime-200',
  'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200',
  'bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200',
  'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200 font-semibold',
  'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200 font-semibold',
];

export default function DurationCell({ value, bucketIndex, onClick, ariaLabel }: DurationCellProps) {
  if (value === null || value === 0) {
    return <td className="border-b border-(--border) px-2 py-1.5 text-center text-(--text-muted)">-</td>;
  }

  const colorClass = CELL_COLORS[bucketIndex] ?? CELL_COLORS[CELL_COLORS.length - 1];
  const clickable = typeof onClick === 'function';

  return (
    <td className={`border-b border-(--border) px-2 py-1.5 text-center font-mono text-[11px] ${colorClass}`}>
      {clickable ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          aria-label={ariaLabel}
          title={ariaLabel}
          className="inline-flex min-w-8 items-center justify-center rounded-md px-2 py-1 transition-all duration-150 cursor-pointer hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          {value}
        </button>
      ) : (
        <span>{value}</span>
      )}
    </td>
  );
}
