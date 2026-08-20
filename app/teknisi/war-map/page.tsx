export const dynamic = 'force-dynamic';

import TeknisiWarMapHeader from './TeknisiWarMapHeader';
import TeknisiWarMapPageClient from './TeknisiWarMapPageClient';

export default function TeknisiWarMapPage() {
  return (
    <div className='space-y-4'>
      <TeknisiWarMapHeader />
      <TeknisiWarMapPageClient />
    </div>
  );
}