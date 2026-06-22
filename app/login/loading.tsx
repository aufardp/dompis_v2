export default function Loading() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-(--bg)'>
      <div className='rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
        <div className='h-4 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800' />
        <div className='mt-3 h-3 w-56 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/70' />
      </div>
    </div>
  );
}
