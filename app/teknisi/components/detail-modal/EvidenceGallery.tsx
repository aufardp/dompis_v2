'use client';

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
        <div className='grid grid-cols-3 gap-3 sm:gap-3'>
          {evidence.map((ev, idx) => (
            <button
              key={ev.id}
              type='button'
              onClick={() => onImageClick(idx)}
              className='relative overflow-hidden rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none'
              aria-label={`Open evidence ${idx + 1}`}
            >
              <img
                src={ev.driveUrl ?? ev.url}
                alt={ev.fileName}
                loading='lazy'
                decoding='async'
                className='h-20 w-full object-cover sm:h-24'
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
