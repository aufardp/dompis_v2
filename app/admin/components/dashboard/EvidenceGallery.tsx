'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface EvidenceItem {
  id: number;
  fileName: string;
  url: string;
  driveUrl: string | null;
}

interface EvidenceGalleryProps {
  items: EvidenceItem[];
  initialIndex?: number;
  onClose: () => void;
}

export default function EvidenceGallery({
  items,
  initialIndex = 0,
  onClose,
}: EvidenceGalleryProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(initialIndex);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartX = useRef<number | null>(null);

  const current = items[index];
  const imageUrl = current?.driveUrl ?? current?.url;

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setIndex(initialIndex); }, [initialIndex]);

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(newIndex, items.length - 1));
      setIndex(clamped);
      setImgLoaded(false);
      setImgError(false);
    },
    [items.length],
  );

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prev, next, onClose]);

  useEffect(() => {
    const el = thumbnailRefs.current[index];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [index]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) prev();
      else next();
    }
    touchStartX.current = null;
  };

  if (!mounted || !current || items.length === 0) return null;

  const content = (
    <div
      className='fixed inset-0 z-[200] flex h-full w-full flex-col overflow-hidden bg-black/95 backdrop-blur-sm'
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className='relative z-10 flex shrink-0 items-center justify-between px-4 py-3'>
        <button
          type='button'
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className='flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white'
          aria-label='Tutup'
        >
          <X size={20} />
        </button>

        <span className='text-sm font-medium text-white/70'>
          {index + 1} / {items.length}
        </span>

        <div className='w-9' />
      </div>

      <div
        className='relative flex flex-1 items-center justify-center px-4'
        onClick={(e) => e.stopPropagation()}
      >
        {index > 0 && (
          <button
            type='button'
            onClick={prev}
            className='absolute left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 md:flex'
            aria-label='Gambar sebelumnya'
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {index < items.length - 1 && (
          <button
            type='button'
            onClick={next}
            className='absolute right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 md:flex'
            aria-label='Gambar selanjutnya'
          >
            <ChevronRight size={22} />
          </button>
        )}

        <div
          className={`relative flex items-center justify-center transition-opacity duration-200 ${
            imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <img
            key={current.id}
            src={imageUrl}
            alt={current.fileName}
            className='max-h-[65vh] max-w-full rounded-lg object-contain'
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true); }}
          />
          {!imgLoaded && !imgError && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white' />
            </div>
          )}
          {imgError && (
            <div className='flex h-48 w-72 items-center justify-center rounded-lg bg-slate-800'>
              <p className='text-sm text-slate-400'>Gambar tidak tersedia</p>
            </div>
          )}
        </div>
      </div>

      <div className='shrink-0 px-4 pb-3'>
        <p className='mb-2 truncate text-center text-xs text-white/50'>
          {current.fileName}
        </p>

        <div className='relative'>
          <div
            className='flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 py-1 pb-3'
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.3) transparent' }}
          >
            {items.map((item, i) => {
              const url = item.driveUrl ?? item.url;
              return (
                <button
                  key={item.id}
                  ref={(el) => { thumbnailRefs.current[i] = el; }}
                  type='button'
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  className={`shrink-0 snap-center rounded-md overflow-hidden transition-all ${
                    i === index
                      ? 'ring-2 ring-white scale-105'
                      : 'opacity-50 hover:opacity-90'
                  }`}
                >
                  <img
                    src={url}
                    alt={item.fileName}
                    className='h-14 w-20 object-cover'
                    onError={(el) => {
                      const img = el.target as HTMLImageElement;
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = '1';
                        img.src = '/assets/logo.webp';
                      }
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
