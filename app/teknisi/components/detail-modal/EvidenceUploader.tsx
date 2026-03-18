'use client';

import { useState, useMemo } from 'react';

interface EvidenceUploaderProps {
  onFilesChange: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  previewUrls: string[];
  uploading: boolean;
  existingCount?: number;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total
const MAX_FILES = 5;
const MIN_FILES = 2;

interface FileWithSize {
  file: File;
  size: number;
}

interface RejectedFile {
  name: string;
  size: number;
  reason: 'oversized' | 'total_exceeded';
}

const formatMB = (bytes: number): string => {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getProgressColor = (bytes: number): string => {
  if (bytes > MAX_TOTAL_SIZE) return 'bg-red-500';
  if (bytes > 7 * 1024 * 1024) return 'bg-yellow-500';
  return 'bg-green-500';
};

export default function EvidenceUploader({
  onFilesChange,
  onRemoveImage,
  previewUrls,
  uploading,
  existingCount = 0,
}: EvidenceUploaderProps) {
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileWithSize[]>([]);

  const totalFiles = existingCount + previewUrls.length;
  const availableSlots = Math.max(0, MAX_FILES - totalFiles);

  const totalSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0);
  }, [selectedFiles]);

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;

    setRejectedFiles([]);
    const fileArray = Array.from(files);
    const oversized: RejectedFile[] = [];
    const validFiles: FileWithSize[] = [];

    // Step 1: Filter oversized files (>2MB per file)
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        oversized.push({
          name: file.name,
          size: file.size,
          reason: 'oversized',
        });
      } else {
        validFiles.push({ file, size: file.size });
      }
    }

    // Step 2: Check if we exceed available slots
    let filesToAdd = validFiles;
    if (validFiles.length > availableSlots) {
      filesToAdd = validFiles.slice(0, availableSlots);
    }

    // Step 3: Check total size including existing previewUrls
    // Estimate existing previews at ~500KB each (compressed)
    const currentPreviewSize = previewUrls.length * 500000;
    const newTotalSize = currentPreviewSize + filesToAdd.reduce((sum, f) => sum + f.size, 0);

    if (newTotalSize > MAX_TOTAL_SIZE) {
      // Total exceeds 10MB - reject entire batch
      setRejectedFiles([
        ...oversized,
        {
          name: `Total ukuran file (${formatMB(newTotalSize)})`,
          size: newTotalSize,
          reason: 'total_exceeded',
        },
      ]);
      return;
    }

    // Step 4: Set warnings for oversized files
    if (oversized.length > 0) {
      setRejectedFiles(oversized);
    }

    // Step 5: Update selected files
    if (filesToAdd.length > 0) {
      setSelectedFiles(filesToAdd);
      onFilesChange(filesToAdd.map((f) => f.file));
    }
  };

  const oversizedFiles = rejectedFiles.filter((f) => f.reason === 'oversized');
  const totalExceeded = rejectedFiles.find((f) => f.reason === 'total_exceeded');

  const isComplete = totalFiles >= MIN_FILES;
  const progressLabel = `${totalFiles}/${MAX_FILES} foto${MIN_FILES > 0 ? ` · min ${MIN_FILES}` : ''}`;

  return (
    <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-4 sm:p-5'>
      {/* Header with badge counter */}
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-slate-600 sm:text-base'>
          Evidence Foto
        </h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
            isComplete
              ? 'border-green-200 bg-green-50 text-green-600'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          {progressLabel}
        </span>
      </div>

      {/* Drop zone */}
      <label
        className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 transition-colors ${
          availableSlots <= 0
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-slate-50'
        }`}
      >
        + Tambah Foto (Min Foto ODP dan Barcode DC)
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
        <p className='text-xs text-amber-600'>
          Slot foto sudah penuh (maksimal {MAX_FILES} foto)
        </p>
      )}

      {/* Warning UI - Oversized Files */}
      {oversizedFiles.length > 0 && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3'>
          <p className='text-xs font-semibold text-red-700'>
            ⛔ File ditolak — melebihi 2 MB per file
          </p>
          <ul className='mt-1 space-y-0.5'>
            {oversizedFiles.map((f, idx) => (
              <li key={idx} className='text-xs text-red-600'>
                • {f.name} ({formatMB(f.size)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warning UI - Total Exceeded */}
      {totalExceeded && (
        <div className='rounded-lg border border-orange-200 bg-orange-50 p-3'>
          <p className='text-xs font-semibold text-orange-700'>
            ⚠️ {totalExceeded.name} melebihi batas total 10MB
          </p>
          <p className='mt-0.5 text-xs text-orange-600'>
            Kurangi ukuran file atau jumlah file yang diupload
          </p>
        </div>
      )}

      {/* Progress Bar */}
      {selectedFiles.length > 0 && (
        <div className='space-y-1'>
          <div className='flex items-center justify-between text-xs'>
            <span className='font-medium text-slate-600'>
              {selectedFiles.length} file dipilih
            </span>
            <span
              className={`font-semibold ${
                totalSize > MAX_TOTAL_SIZE
                  ? 'text-red-600'
                  : totalSize > 7 * 1024 * 1024
                    ? 'text-yellow-600'
                    : 'text-green-600'
              }`}
            >
              {formatMB(totalSize)} / {formatMB(MAX_TOTAL_SIZE)}
            </span>
          </div>
          <div className='h-2 w-full overflow-hidden rounded-full bg-slate-200'>
            <div
              className={`h-full transition-all duration-300 ${getProgressColor(totalSize)}`}
              style={{
                width: `${Math.min(100, (totalSize / MAX_TOTAL_SIZE) * 100)}%`,
              }}
            />
          </div>
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
                className='h-full w-full rounded-lg border object-cover'
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
            <label className='flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-2xl text-slate-300 transition-colors hover:bg-slate-100'>
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
        <p className='text-center text-sm text-blue-600'>
          Mengupload evidence...
        </p>
      )}
    </div>
  );
}
