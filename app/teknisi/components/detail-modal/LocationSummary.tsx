'use client';

import { MapPin } from 'lucide-react';
import type { Ticket } from '@/app/types/ticket';
import { formatDateTimeWIB } from '@/app/utils/datetime';
import MiniMap from './MiniMap';

interface Props {
  location: NonNullable<Ticket['serviceLocation']>;
}

function coordsLabel(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function sourceLabel(source: string | null) {
  if (source === 'reused_bank_data') return 'Data Bank (reuse)';
  if (source === 'manual_tag') return 'Tag Manual';
  return source || null;
}

export default function LocationSummary({ location }: Props) {
  const lat = location.latitude;
  const lng = location.longitude;
  const coords = coordsLabel(lat, lng);

  return (
    <div className='space-y-3'>
      {coords && (
        <MiniMap
          lat={lat ?? 0}
          lng={lng ?? 0}
          draggable={false}
          accuracy={location.accuracyMeters}
          className='h-32!'
        />
      )}
      <div className='grid grid-cols-2 gap-3'>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Koordinat
          </p>
          {coords ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 text-sm font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400'
            >
              {coords}
            </a>
          ) : (
            <p className='text-sm font-semibold text-(--text-primary)'>
              Tidak tersedia
            </p>
          )}
        </div>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Barcode DC
          </p>
          <p className='text-sm font-semibold text-(--text-primary)'>
            {location.barcodeDc || 'Tidak tersedia'}
          </p>
        </div>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Device (ODP)
          </p>
          <p className='text-sm font-semibold text-(--text-primary)'>
            {location.deviceName || 'Tidak tersedia'}
          </p>
        </div>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Akurasi
          </p>
          <p className='text-sm font-semibold text-(--text-primary)'>
            {Number.isFinite(location.accuracyMeters)
              ? `${location.accuracyMeters} m`
              : 'Tidak tersedia'}
          </p>
        </div>
      </div>
      <div className='space-y-1'>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Sumber
          </p>
          <p className='text-sm font-semibold text-(--text-primary)'>
            {sourceLabel(location.source) || 'Tidak tersedia'}
          </p>
        </div>
        <div>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Ditandai
          </p>
          <p className='text-sm font-semibold text-(--text-primary)'>
            {location.taggedAt
              ? formatDateTimeWIB(location.taggedAt)
              : 'Tidak tersedia'}
            {location.technicianName
              ? ` · ${location.technicianName}`
              : ''}
          </p>
        </div>
      </div>
      <div className='flex items-center gap-1.5 text-[11px] text-(--text-tertiary)'>
        <MapPin size={12} />
        Lokasi tersimpan dari penanganan tiket ini
      </div>
    </div>
  );
}
