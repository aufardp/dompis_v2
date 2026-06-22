'use client';


export default function TeknisiAttendanceLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading attendance'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='bg-surface-2 h-8 w-48 rounded' />
        <div className='bg-surface-2 h-32 w-full rounded-2xl' />
        <div className='bg-surface-2 h-48 w-full rounded-2xl' />
      </div>
    </phantom-ui>
  );
}
