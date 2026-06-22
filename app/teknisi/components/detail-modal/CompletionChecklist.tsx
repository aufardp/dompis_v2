interface CompletionChecklistProps {
  photoCount: number;
  photoRequired: number;
  isOnProgress: boolean;
}

export default function CompletionChecklist({
  photoCount,
  photoRequired,
  isOnProgress,
}: CompletionChecklistProps) {
  if (!isOnProgress) return null;

  return (
    <div className='flex gap-2'>
      <div
        className={`flex flex-1 items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 ${
          photoCount >= photoRequired
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400'
            : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400'
        }`}
      >
        <span className='text-sm'>📷</span>
        <div>
          <p className='mb-0.5 text-[10px] leading-none font-bold tracking-wide uppercase'>
            Foto
          </p>
          <p className='text-xs font-bold'>
            {photoCount} / {photoRequired}
          </p>
        </div>
      </div>
    </div>
  );
}
