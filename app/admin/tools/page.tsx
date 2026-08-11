'use client';

import Link from 'next/link';
import { MapPinned, Upload, Layers, ArrowRight } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

function ToolCard({
  title,
  description,
  href,
  icon: Icon,
  iconClass,
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof MapPinned;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className='group flex flex-col justify-between gap-5 rounded-2xl border border-(--border) bg-(--surface) p-5 transition-all hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/5'
    >
      <div className='flex items-start justify-between gap-4'>
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition-colors ${iconClass}`}
        >
          <Icon className='h-5 w-5' />
        </div>
        <ArrowRight className='h-4 w-4 shrink-0 text-(--text-tertiary) transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500' />
      </div>
      <div>
        <h3 className='text-base font-bold text-(--text-primary)'>{title}</h3>
        <p className='mt-1 text-sm leading-6 text-(--text-secondary)'>{description}</p>
      </div>
    </Link>
  );
}

export default function ToolsPage() {
  const { user } = useCurrentUser();
  const isHelpdesk = user?.role_key === 'helpdesk';

  return (
    <AdminLayout>
      <div className='space-y-4'>
        <div>
          <h1 className='text-2xl font-semibold text-(--text-primary)'>Tools</h1>
          <p className='text-sm text-(--text-secondary)'>
            Kumpulan utilitas operasional untuk monitoring dan data lapangan.
          </p>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <ToolCard
            title='War Map'
            description='Peta sebaran lokasi gangguan (geo-tagged) untuk memonitor titik rawan.'
            href='/admin/tools/war-map'
            icon={MapPinned}
            iconClass='border-blue-500/20 bg-blue-500/10 text-blue-600'
          />
          {!isHelpdesk && (
            <ToolCard
              title='Import Tiket'
              description='Upload file CSV/Excel, preview mapping, dan jalankan import data tiket.'
              href='/admin/tools/import-tiket'
              icon={Upload}
              iconClass='border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
            />
          )}
          {!isHelpdesk && (
            <ToolCard
              title='Import KML Skema'
              description='Upload file KML topologi ODC/ODP/kabel sebagai skema overlay War Map.'
              href='/admin/tools/import-kml'
              icon={Layers}
              iconClass='border-indigo-500/20 bg-indigo-500/10 text-indigo-600'
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}