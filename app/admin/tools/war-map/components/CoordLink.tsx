'use client';

import { ExternalLink } from 'lucide-react';

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function CoordLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={googleMapsUrl(lat, lng)}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-0.5 font-mono text-indigo-600 tabular-nums underline decoration-dotted underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300'
      title='Buka koordinat di Google Maps'
    >
      {lat.toFixed(6)}, {lng.toFixed(6)}
      <ExternalLink className='h-2.5 w-2.5' />
    </a>
  );
}
