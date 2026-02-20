'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  images: Array<{ src: string; alt?: string }>;
  isOpen: boolean;
  startIndex?: number;
  onClose: () => void;
}

function clampIndex(value: number, max: number) {
  if (max <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.floor(value)), max - 1);
}

export default function EvidenceSliderModal({
  images,
  isOpen,
  startIndex = 0,
  onClose,
}: Props) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const safeIndex = useMemo(() => clampIndex(index, count), [index, count]);

  useEffect(() => {
    if (!isOpen) return;
    setIndex(clampIndex(startIndex, count));
  }, [isOpen, startIndex, count]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i + 1) % count);
  }, [count]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, goPrev, goNext]);

  if (!isOpen) return null;
  if (count === 0) return null;

  return (
    <div
      className='fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm'
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className='absolute inset-0'
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      <div className='relative z-[61] flex h-full w-full items-center justify-center p-4'>
        <div className='w-full max-w-5xl'>
          <div className='mb-3 flex items-center justify-between text-white'>
            <div className='text-sm'>
              {safeIndex + 1} / {count}
            </div>
            <button
              type='button'
              onClick={onClose}
              className='rounded-full bg-white/10 p-2 hover:bg-white/20'
              aria-label='Close'
            >
              <X size={18} />
            </button>
          </div>

          <div
            className='relative overflow-hidden rounded-2xl bg-black'
            onTouchStart={(e) => {
              touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const startX = touchStartXRef.current;
              touchStartXRef.current = null;
              const endX = e.changedTouches?.[0]?.clientX ?? null;
              if (startX == null || endX == null) return;
              const delta = endX - startX;
              if (Math.abs(delta) < 50) return;
              if (delta > 0) goPrev();
              else goNext();
            }}
          >
            <div
              className='flex transition-transform duration-300 ease-out'
              style={{ transform: `translateX(-${safeIndex * 100}%)` }}
            >
              {images.map((img, i) => (
                <div key={`${img.src}-${i}`} className='min-w-full select-none'>
                  <div className='flex h-[80vh] w-full items-center justify-center'>
                    <img
                      src={img.src}
                      alt={img.alt || `Evidence ${i + 1}`}
                      className='max-h-[80vh] max-w-full object-contain'
                      draggable={false}
                    />
                  </div>
                </div>
              ))}
            </div>

            {count > 1 && (
              <>
                <button
                  type='button'
                  onClick={goPrev}
                  className='absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25'
                  aria-label='Previous image'
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type='button'
                  onClick={goNext}
                  className='absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25'
                  aria-label='Next image'
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>

          {count > 1 && (
            <div className='mt-3 flex gap-2 overflow-x-auto pb-1'>
              {images.map((img, i) => {
                const active = i === safeIndex;
                return (
                  <button
                    key={`${img.src}-thumb-${i}`}
                    type='button'
                    onClick={() => setIndex(i)}
                    className={`h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border transition ${
                      active
                        ? 'border-white'
                        : 'border-white/20 opacity-70 hover:opacity-100'
                    }`}
                    aria-label={`Open image ${i + 1}`}
                  >
                    <img
                      src={img.src}
                      alt={img.alt || `Thumbnail ${i + 1}`}
                      className='h-full w-full object-cover'
                      draggable={false}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
