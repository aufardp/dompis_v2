import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MobilePaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function MobilePagination({
  currentPage,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: MobilePaginationProps) {
  if (totalPages <= 1) return null;

  const from = Math.min((currentPage - 1) * pageSize + 1, total);
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className='flex items-center justify-between gap-3 px-1 pt-2'>
      <p className='text-xs text-(--text-secondary)'>
        {from}–{to} dari {total} tiket
      </p>
      <div className='flex items-center gap-1'>
        <button
          type='button'
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className='flex h-10 w-10 items-center justify-center rounded-xl border border-(--border) bg-(--surface) text-(--text-primary) transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-(--surface-2) active:scale-95 dark:border-(--border) dark:bg-(--surface) dark:text-(--text-primary) dark:hover:bg-(--surface-2)'
          aria-label='Halaman sebelumnya'
        >
          <ChevronLeft size={16} />
        </button>
        <span className='flex h-10 items-center justify-center px-3 text-sm font-semibold text-(--text-primary) dark:text-(--text-primary)'>
          {currentPage}/{totalPages}
        </span>
        <button
          type='button'
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className='flex h-10 w-10 items-center justify-center rounded-xl border border-(--border) bg-(--surface) text-(--text-primary) transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-(--surface-2) active:scale-95 dark:border-(--border) dark:bg-(--surface) dark:text-(--text-primary) dark:hover:bg-(--surface-2)'
          aria-label='Halaman berikutnya'
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}