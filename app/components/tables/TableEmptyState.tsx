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
            <div className='h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600' />
          )}
          <span>{message}</span>
        </div>
      </td>
    </tr>
  );
}
