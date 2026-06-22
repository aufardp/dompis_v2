'use client';

export default function Loading() {
  return (
    <div className='min-h-screen bg-gray-50 p-6 dark:bg-gray-950'>
      <div className='mb-4 flex justify-end'>
        <div className='h-8 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
      </div>
      <div className='space-y-4'>
        <div className='h-12 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800' />
        <div className='h-96 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800' />
      </div>
    </div>
  );
}
