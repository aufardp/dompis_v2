'use client';

import dynamic from 'next/dynamic';

const WarMapClient = dynamic(
  () => import('@/app/admin/tools/war-map/components/WarMapClient'),
  {
    ssr: false,
    loading: () => (
      <div className='h-[calc(100dvh-260px)] min-h-120 animate-pulse rounded-2xl border border-(--border) bg-(--surface)' />
    ),
  },
);

export default function TeknisiWarMapPageClient() {
  return <WarMapClient defaultToLocation />;
}
