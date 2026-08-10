'use client';


export default function ImportTicketLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading import ticket'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='bg-surface-2 h-8 w-48 rounded' />
        <div className='bg-surface-2 h-5 w-72 rounded' />

        <div className='bg-surface rounded-2xl border border-white/[0.07] p-8'>
          <div className='flex flex-col items-center gap-6'>
            <div className='bg-surface-2 h-32 w-full max-w-md rounded-lg' />
            <div className='bg-surface-2 h-10 w-40 rounded-lg' />
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
