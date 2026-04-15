'use client';

import { useState, useCallback } from 'react';

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
  const [compressing, setCompressing] = useState(false);

  const compressImage = useCallback(
    async (file: File): Promise<File> => {
      // Skip non-image files
      if (!file.type.startsWith('image/')) return file;

      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          URL.revokeObjectURL(url);

          const TARGET_SIZE = 3 * 1024 * 1024; // 3MB — target per file after compression

          // Pass 1: kompres ke 1920px, quality 0.82
          const canvas = document.createElement('canvas');
          const scale1 = Math.min(1, 1920 / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale1);
          canvas.height = Math.round(img.height * scale1);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            async (blob1) => {
              if (!blob1) { resolve(file); return; }

              // Jika hasil pass 1 sudah ≤ 3MB → selesai
              if (blob1.size <= TARGET_SIZE) {
                resolve(new File([blob1], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                return;
              }

              // Pass 2: turunkan ke 1280px, quality 0.70
              const scale2 = Math.min(1, 1280 / Math.max(img.width, img.height));
              canvas.width = Math.round(img.width * scale2);
              canvas.height = Math.round(img.height * scale2);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              canvas.toBlob(
                async (blob2) => {
                  if (!blob2) {
                    resolve(new File([blob1], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                    return;
                  }

                  // Jika pass 2 masih > 3MB → pass 3: 960px, quality 0.60
                  if (blob2.size <= TARGET_SIZE) {
                    resolve(new File([blob2], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                    return;
                  }

                  // Pass 3: fallback ke 960px, quality 0.60
                  const scale3 = Math.min(1, 960 / Math.max(img.width, img.height));
                  canvas.width = Math.round(img.width * scale3);
                  canvas.height = Math.round(img.height * scale3);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob(
                    (blob3) => {
                      resolve(new File(
                        [blob3 ?? blob2],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg' }
                      ));
                    },
                    'image/jpeg',
                    0.60,
                  );
                },
                'image/jpeg',
                0.70,
              );
            },
            'image/jpeg',
            0.82,
          );
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(file); // fallback: kirim file original jika tidak bisa decode
        };

        img.src = url;
      });
    },
    [],
  );

  const totalFiles = existingCount + previewUrls.length;
  const availableSlots = Math.max(0, maxFiles - totalFiles);

  const handleFileChange = async (files: FileList | null) => {
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

    // Step 4: Auto compress images before passing to parent
    if (filesToAdd.length > 0) {
      setCompressing(true);
      try {
        const compressed = await Promise.all(
          filesToAdd.map((f) =>
            f.type.startsWith('image/') ? compressImage(f) : Promise.resolve(f),
          ),
        );
        onFilesChange(compressed);
      } catch {
        onWarning?.('Gagal mengkompres foto. Coba lagi.');
      } finally {
        setCompressing(false);
      }
    }
  };

  const oversizedFiles = rejectedFiles.filter((f) => f.reason === 'oversized');

  const isComplete = totalFiles >= minFiles;
  const progressLabel = `${totalFiles}/${maxFiles} foto${minFiles > 0 ? ` · wajib ${minFiles}` : ''}`;

  return (
    <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900'>
      {/* Header with badge counter */}
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-slate-600 sm:text-base dark:text-slate-300'>
          Evidence Foto (Wajib {maxFiles})
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
          Slot foto sudah penuh (mantap sudah {maxFiles} foto)
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

      {compressing && (
        <div className='flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'>
          <svg className='h-4 w-4 animate-spin' fill='none' viewBox='0 0 24 24'>
            <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
            <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
          </svg>
          Mengompres foto... harap tunggu
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
