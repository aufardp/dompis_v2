type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const windowSize = Math.min(3, totalPages);
  const start = Math.max(
    1,
    Math.min(currentPage - 1, totalPages - windowSize + 1),
  );
  const pagesAroundCurrent = Array.from(
    { length: windowSize },
    (_, i) => start + i,
  );

  return (
    <div className='flex flex-wrap items-center justify-center gap-2'>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className='flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50'
      >
        <svg
          className='h-4 w-4 sm:mr-1'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M15 19l-7-7 7-7'
          />
        </svg>
        <span className='hidden sm:inline'>Previous</span>
      </button>

      <div className='flex items-center gap-1'>
        {currentPage > 3 && <span className='px-2 text-gray-500'>...</span>}
        {pagesAroundCurrent.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium ${
              currentPage === page
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {page}
          </button>
        ))}
        {currentPage < totalPages - 2 && (
          <span className='px-2 text-gray-500'>...</span>
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className='flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50'
      >
        <span className='hidden sm:inline'>Next</span>
        <svg
          className='h-4 w-4 sm:ml-1'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M9 5l7 7-7 7'
          />
        </svg>
      </button>
    </div>
  );
};

export default Pagination;
