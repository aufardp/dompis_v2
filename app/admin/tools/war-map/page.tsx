export const dynamic = 'force-dynamic';

import AdminLayout from '@/app/components/layout/AdminLayout';
import WarMapPageClient from './WarMapPageClient';

const warMapEnabled = process.env.WAR_MAP_ENABLED === 'true';

export default function WarMapPage() {
  return (
    <AdminLayout>
      <div className='space-y-4'>
        <div>
          <h1 className='text-2xl font-semibold text-(--text-primary)'>
            War Map
          </h1>
          <p className='text-sm text-(--text-secondary)'>
            Peta sebaran lokasi gangguan untuk memonitor titik rawan
          </p>
        </div>
        {warMapEnabled ? (
          <WarMapPageClient />
        ) : (
          <div className='rounded-2xl border border-dashed border-(--border) bg-(--surface) px-6 py-16 text-center'>
            <p className='text-sm font-semibold text-(--text-primary)'>
              Fitur War Map belum diaktifkan
            </p>
            <p className='mt-1 text-xs text-(--text-secondary)'>
              Set WAR_MAP_ENABLED=true di ecosystem.config.js untuk mengaktifkan
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
