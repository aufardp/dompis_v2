'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Camera } from 'lucide-react';

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
  title?: string;
  onImageClick: (index: number) => void;
}

export default function EvidenceGallery({
  evidence,
  loading,
  error,
  title = 'Evidence Foto',
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
    <div className='space-y-3 rounded-2xl border border-(--border) bg-(--surface) p-4 sm:space-y-4 sm:p-5'>
      <h3 className='text-sm font-semibold text-(--text-primary) sm:text-base'>
        {title}
      </h3>

      {error && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400'>
          {error}
        </div>
      )}

      {loading ? (
        <div className='text-sm text-(--text-tertiary)'>Memuat evidence...</div>
      ) : evidence.length === 0 ? (
        <div className='text-sm text-(--text-tertiary)'>Tidak ada evidence</div>
      ) : (
        <div className='grid grid-cols-3 gap-4 sm:gap-4'>
          {evidence.map((ev, idx) => (
            <div key={ev.id} className='space-y-2'>
              <button
                type='button'
                onClick={() => onImageClick(idx)}
                className='relative aspect-4/3 min-h-20 w-full overflow-hidden rounded-xl border border-(--border) bg-(--surface-2) focus:ring-2 focus:ring-blue-500 focus:outline-none sm:min-h-24'
                aria-label={`Open evidence ${idx + 1}`}
              >
                {hasFailed(ev.id) ? (
                  <div className='flex h-full w-full flex-col items-center justify-center bg-(--surface-2)'>
                    <Camera
                      size={20}
                      strokeWidth={1.5}
                      className='text-(--text-tertiary)'
                    />
                    <span className='text-xs text-(--text-tertiary)'>
                      Gagal load
                    </span>
                  </div>
                ) : (
                  <Image
                    src={getImageSrc(ev)}
                    alt={ev.fileName}
                    fill
                    sizes='(max-width: 640px) 33vw, 25vw'
                    className='object-cover'
                    unoptimized
                    onError={() => handleImageError(ev.id)}
                    onLoad={() => handleImageLoad(ev.id)}
                  />
                )}
              </button>

              <button
                type='button'
                onClick={() => onImageClick(idx)}
                className='line-clamp-2 w-full text-left text-[11px] font-medium break-all text-(--text-secondary) hover:text-blue-600'
                title={ev.fileName}
              >
                {ev.fileName}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
