'use client';


export default function HelpdeskLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading helpdesk dashboard'
    >
      <div className='min-h-screen bg-gray-50 p-6'>
        <div className='mx-auto max-w-7xl'>
          <div className='mb-8'>
            <div className='bg-gray-200 h-9 w-64 rounded' />
            <div className='bg-gray-200 mt-2 h-5 w-48 rounded' />
          </div>

          <div className='mb-8 grid grid-cols-1 gap-4 md:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='rounded-xl border border-slate-200 bg-white p-5'>
                <div className='bg-slate-200 h-8 w-12 rounded' />
                <div className='bg-slate-200 mt-2 h-4 w-24 rounded' />
              </div>
            ))}
          </div>

          <div>
            <div className='bg-gray-200 mb-4 h-6 w-32 rounded' />
            <div className='space-y-3'>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className='rounded-xl border border-slate-200 bg-white p-4'>
                  <div className='flex items-start gap-4'>
                    <div className='bg-slate-200 h-4 w-20 rounded' />
                    <div className='bg-slate-200 h-4 flex-1 rounded' />
                    <div className='bg-slate-200 h-5 w-16 rounded-full' />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
