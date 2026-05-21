interface DurationCellProps {
  value: number | null;
  bucketIndex: number;
  totalBuckets: number;
}

const CELL_COLORS = [
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
  'bg-lime-100 text-lime-900 dark:bg-lime-900/30 dark:text-lime-200',
  'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200',
  'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200',
  'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200 font-bold',
  'bg-red-900 text-white font-bold dark:bg-red-950',
];

export default function DurationCell({ value, bucketIndex }: DurationCellProps) {
  if (value === null || value === 0) {
    return <td className="px-1 py-0.5 text-center border-b border-gray-100 dark:border-gray-800">&nbsp;</td>;
  }

  const colorClass = CELL_COLORS[bucketIndex] ?? CELL_COLORS[CELL_COLORS.length - 1];

  return (
    <td className={`px-1 py-0.5 text-center font-mono text-xs border-b border-gray-100 dark:border-gray-800 ${colorClass}`}>
      {value}
    </td>
  );
}
