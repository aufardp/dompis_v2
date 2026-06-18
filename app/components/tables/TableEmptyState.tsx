type TableEmptyStateProps = {
  colSpan: number;
  message?: string;
  heightClass?: string;
  loading?: boolean;
};

export default function TableEmptyState({
  colSpan,
  message = 'No data found',
  heightClass = 'h-40',
  loading = false,
}: TableEmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className='p-0'>
        <div
          className={`flex flex-col items-center justify-center gap-3 ${heightClass} text-gray-500`}
        >
          {loading && (
            <div className='h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700' />
          )}
          <span>{message}</span>
        </div>
      </td>
    </tr>
  );
}
