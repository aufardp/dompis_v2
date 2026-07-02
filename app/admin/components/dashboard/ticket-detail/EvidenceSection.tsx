'use client';

import type { EvidenceItem } from './types';
import Image from 'next/image';
import EvidenceGallery from '../EvidenceGallery';
import { Camera } from 'lucide-react';

function EvidenceSectionLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading evidence photos'
    >
      <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
        <div className='mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-700'>
          <div className='h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-700' />
          <div className='h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-700' />
          <div className='ml-auto h-4 w-12 rounded-full bg-slate-100 dark:bg-slate-700' />
        </div>

        <div className='grid grid-cols-2 gap-2'>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className='relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-700/40'
            >
              <div className='absolute inset-0 bg-slate-200/70 dark:bg-slate-700/40' />
              <div className='absolute right-0 bottom-0 left-0 bg-black/20 px-2 py-1'>
                <div className='h-2.5 w-5/6 rounded-full bg-white/60' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </phantom-ui>
  );
}

interface EvidenceSectionProps {
  evidence: EvidenceItem[];
  loading: boolean;
  isClosed: boolean;
  isPending: boolean;
  onGalleryOpen: (index: number) => void;
  galleryIndex: number;
  galleryOpen: boolean;
  onGalleryClose: () => void;
}

export function EvidenceSection({
  evidence,
  loading,
  isClosed,
  isPending,
  onGalleryOpen,
  galleryIndex,
  galleryOpen,
  onGalleryClose,
}: EvidenceSectionProps) {
  return (
    <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
      <div className='mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-700'>
        <Camera size={14} className='text-slate-500' />
        <h3 className='text-xs font-semibold tracking-wider text-slate-700 uppercase dark:text-slate-300'>
          Evidence Foto
        </h3>
        {isPending && (
          <span className='ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'>
            Pending
          </span>
        )}
        {isClosed && (
          <span className='ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:bg-green-500/20 dark:text-green-400'>
            Closed
          </span>
        )}
        {evidence.length > 0 && (
          <span className='ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400'>
            {evidence.length} foto
          </span>
        )}
      </div>

      {loading ? (
        <EvidenceSectionLoading />
      ) : evidence.length === 0 ? (
        <p className='py-2 text-sm text-slate-400'>Tidak ada evidence foto</p>
      ) : (
        <div className='grid grid-cols-2 gap-2'>
          {evidence.map((e, idx) => {
            const imageUrl = e.driveUrl ?? e.url;
            return (
              <button
                key={e.id}
                type='button'
                onClick={() => onGalleryOpen(idx)}
                className='group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left'
              >
                <Image
                  src={imageUrl}
                  alt={e.fileName}
                  fill
                  sizes='(max-width: 768px) 50vw, 33vw'
                  className='object-cover transition-opacity group-hover:opacity-80'
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (!target.dataset.fallback) {
                      target.dataset.fallback = '1';
                      target.src = '/assets/logo.webp';
                    }
                  }}
                />
                <div className='absolute right-0 bottom-0 left-0 bg-black/50 px-2 py-1'>
                  <p className='truncate text-[10px] text-white'>{e.fileName}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {galleryOpen && (
        <EvidenceGallery
          items={evidence}
          initialIndex={galleryIndex}
          onClose={onGalleryClose}
        />
      )}
    </div>
  );
}
