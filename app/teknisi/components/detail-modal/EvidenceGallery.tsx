'use client';

import { useState } from 'react';

interface EvidenceItem {
  id: number;
  fileName: string;
  filePath: string;
  url: string;
  driveUrl: string | null;
}

interface EvidenceGalleryProps {
  evidence: EvidenceItem[];
  loading: boolean;
  error?: string | null;
  onImageClick: (index: number) => void;
}

export default function EvidenceGallery({
  evidence,
  loading,
  error,
  onImageClick,
}: EvidenceGalleryProps) {
  const [failedImages, setFailedImages] = useState<Map<number, boolean>>(
    new Map(),
  );

  const handleImageError = (id: number) => {
    setFailedImages((prev) => {
      const next = new Map(prev);
      next.set(id, true);
      return next;
    });
  };

  const handleImageLoad = (id: number) => {
    setFailedImages((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const getImageSrc = (ev: EvidenceItem) => {
    if (ev.driveUrl) {
      return ev.driveUrl;
    }
    return ev.url;
  };

  const hasFailed = (id: number) => failedImages.get(id) === true;

  return (
    <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-4 sm:p-5'>
      <h3 className='text-sm font-semibold text-slate-600 sm:text-base'>
        Evidence Foto
      </h3>

      {error && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
          {error}
        </div>
      )}

      {loading ? (
        <div className='text-sm text-slate-500'>Memuat evidence...</div>
      ) : evidence.length === 0 ? (
        <div className='text-sm text-slate-500'>Tidak ada evidence</div>
      ) : (
        <div className='grid grid-cols-3 gap-4 sm:gap-4'>
          {evidence.map((ev, idx) => (
            <button
              key={ev.id}
              type='button'
              onClick={() => onImageClick(idx)}
              className='relative overflow-hidden rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none'
              aria-label={`Open evidence ${idx + 1}`}
            >
              {hasFailed(ev.id) ? (
                <div className='flex h-20 w-full flex-col items-center justify-center bg-slate-100 sm:h-24'>
                  <span className='text-xl'>📷</span>
                  <span className='text-xs text-slate-400'>Gagal load</span>
                </div>
              ) : (
                <img
                  src={getImageSrc(ev)}
                  alt={ev.fileName}
                  loading='lazy'
                  decoding='async'
                  className='h-20 w-full object-cover sm:h-24'
                  onError={() => handleImageError(ev.id)}
                  onLoad={() => handleImageLoad(ev.id)}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
