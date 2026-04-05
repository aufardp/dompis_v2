'use client';

import { useState } from 'react';

interface EvidenceUploaderProps {
  onFilesChange: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  previewUrls: string[];
  uploading: boolean;
  existingCount?: number;
  onWarning?: (warning: string | null) => void;
  minFiles?: number;
  maxFiles?: number;
  instructions?: string[];
}

// KRITIS: Batas ini untuk file RAW sebelum kompresi
// Foto iPhone bisa 3-8MB, setelah compressImage (1920px, 0.82) jadi ~400KB-1MB
// Jadi batas pre-compress yang masuk akal adalah 15MB (bukan 2MB!)
// Validasi ukuran sebenarnya (2MB) dilakukan SETELAH kompresi di parent component
const MAX_FILE_SIZE_RAW = 15 * 1024 * 1024; // 15MB — file mentah sebelum compress

// Default instructions for close ticket (5 steps)
const DEFAULT_INSTRUCTIONS = [
  'Foto Penyebab (Putusnya, ONT rusaknya, dll)',
  'Foto Perbaikan (Ganti ONT, Tarik Ulang, Penyambungan, dll)',
  'Capture SCC (halaman SCC layak)',
  'Foto dengan pelanggan',
  'Foto lokasi pelanggan',
];

interface RejectedFile {
  name: string;
  size: number;
  reason: 'oversized';
}

const formatMB = (bytes: number): string => {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function EvidenceUploader({
  onFilesChange,
  onRemoveImage,
  previewUrls,
  uploading,
  existingCount = 0,
  onWarning,
  minFiles = 2,
  maxFiles = 5,
  instructions,
}: EvidenceUploaderProps) {
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([]);

  const totalFiles = existingCount + previewUrls.length;
  const availableSlots = Math.max(0, maxFiles - totalFiles);

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;

    setRejectedFiles([]);
    onWarning?.(null);

    const fileArray = Array.from(files);
    const oversized: RejectedFile[] = [];
    const validFiles: File[] = [];

    // Step 1: Filter hanya file yang TIDAK masuk akal (>15MB kemungkinan bukan foto)
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE_RAW) {
        oversized.push({
          name: file.name,
          size: file.size,
          reason: 'oversized',
        });
      } else {
        validFiles.push(file);
      }
    }

    // Step 2: Check if we exceed available slots
    let filesToAdd = validFiles;
    if (validFiles.length > availableSlots) {
      filesToAdd = validFiles.slice(0, availableSlots);
    }

    // Step 3: Set warnings for oversized files
    if (oversized.length > 0) {
      setRejectedFiles(oversized);
      const names = oversized.map((f) => f.name).join(', ');
      onWarning?.(
        oversized.length === 1
          ? `${oversized[0].name} terlalu besar — maks 15 MB per foto`
          : `${oversized.length} foto ditolak — masing-masing maks 15 MB`,
      );
    }

    // Step 4: Update selected files
    if (filesToAdd.length > 0) {
      onFilesChange(filesToAdd);
    }
  };

  const oversizedFiles = rejectedFiles.filter((f) => f.reason === 'oversized');

  const isComplete = totalFiles >= minFiles;
  const progressLabel = `${totalFiles}/${maxFiles} foto${minFiles > 0 ? ` · min ${minFiles}` : ''}`;

  return (
    <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900'>
      {/* Header with badge counter */}
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-slate-600 sm:text-base dark:text-slate-300'>
          Evidence Foto (Max {maxFiles})
        </h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
            isComplete
              ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-500/20 dark:bg-green-500/15 dark:text-green-400'
              : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400'
          }`}
        >
          {progressLabel}
        </span>
      </div>

      {/* Drop zone */}
      <label
        className={`block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 transition-colors dark:border-slate-600 dark:text-slate-400 ${
          availableSlots <= 0
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <ol className='list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400'>
          {(instructions ?? DEFAULT_INSTRUCTIONS).map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
        <input
          type='file'
          multiple
          accept='image/*'
          hidden
          onChange={(e) => handleFileChange(e.target.files)}
          disabled={availableSlots <= 0}
        />
      </label>

      {availableSlots <= 0 && (
        <p className='text-xs text-amber-600 dark:text-amber-400'>
          Slot foto sudah penuh (maksimal {maxFiles} foto)
        </p>
      )}

      {/* Warning UI - Oversized Files */}
      {oversizedFiles.length > 0 && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10'>
          <p className='text-xs font-semibold text-red-700 dark:text-red-400'>
            ⛔ File ditolak — ukuran tidak wajar (bukan foto valid)
          </p>
          <ul className='mt-1 space-y-0.5'>
            {oversizedFiles.map((f, idx) => (
              <li key={idx} className='text-xs text-red-600 dark:text-red-400'>
                • {f.name} ({formatMB(f.size)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview Grid */}
      {previewUrls.length > 0 && (
        <div className='grid grid-cols-3 gap-2 sm:grid-cols-3'>
          {previewUrls.map((url, index) => (
            <div key={index} className='relative aspect-square'>
              <img
                src={url}
                alt={`Preview ${index + 1}`}
                loading='lazy'
                decoding='async'
                className='h-full w-full rounded-lg border object-cover dark:border-slate-700'
              />
              <button
                type='button'
                onClick={() => onRemoveImage(index)}
                className='absolute top-0.5 right-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white sm:top-1 sm:right-1 sm:px-2 sm:text-xs'
              >
                ✕
              </button>
              {/* Index badge */}
              <span className='absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] font-black text-white'>
                {index + 1}
              </span>
            </div>
          ))}

          {/* Add more slot - show if below max */}
          {availableSlots > 0 && (
            <label className='flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-2xl text-slate-300 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600 dark:hover:bg-slate-700'>
              +
              <input
                type='file'
                multiple
                accept='image/*'
                hidden
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </label>
          )}
        </div>
      )}

      {uploading && (
        <p className='text-center text-sm text-blue-600 dark:text-blue-400'>
          Mengupload evidence...
        </p>
      )}
    </div>
  );
}
