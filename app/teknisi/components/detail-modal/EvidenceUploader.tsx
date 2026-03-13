'use client';

interface EvidenceUploaderProps {
  onFilesChange: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  previewUrls: string[];
  uploading: boolean;
}

export default function EvidenceUploader({
  onFilesChange,
  onRemoveImage,
  previewUrls,
  uploading,
}: EvidenceUploaderProps) {
  const handleFileChange = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);

    if (fileArray.length > 5) {
      alert('Maksimal 5 foto');
      return;
    }

    onFilesChange(fileArray);
  };

  return (
    <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-4 sm:p-5'>
      <h3 className='text-sm font-semibold text-slate-600 sm:text-base'>
        Evidence Foto (Max 5)
      </h3>

      <label className='flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:bg-slate-50'>
        + Tambah Foto
        <input
          type='file'
          multiple
          accept='image/*'
          hidden
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>

      {previewUrls.length > 0 && (
        <div className='grid grid-cols-3 gap-2 sm:grid-cols-3'>
          {previewUrls.map((url, index) => (
            <div key={index} className='relative'>
              <img
                src={url}
                alt={`Preview ${index + 1}`}
                loading='lazy'
                decoding='async'
                className='h-20 w-full rounded-lg border object-cover sm:h-24'
              />
              <button
                type='button'
                onClick={() => onRemoveImage(index)}
                className='absolute top-0.5 right-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white sm:top-1 sm:right-1 sm:px-2 sm:text-xs'
              >
                ✕
              </button>
            </div>
          ))}
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
