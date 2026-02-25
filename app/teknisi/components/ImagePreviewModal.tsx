'use client';

import { X } from 'lucide-react';

interface Props {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ImagePreviewModal({
  imageUrl,
  isOpen,
  onClose,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm'>
      {/* Overlay click to close */}
      <div className='absolute inset-0' onClick={onClose} />

      {/* Image container */}
      <div className='relative z-10 max-h-[90vh] max-w-[90vw] rounded-xl bg-white p-3 shadow-2xl'>
        {/* Close Button */}
        <button
          onClick={onClose}
          className='absolute -top-3 -right-3 rounded-full bg-white p-2 shadow-md hover:bg-gray-100'
        >
          <X size={18} />
        </button>

        <img
          src={imageUrl}
          alt='Preview'
          className='max-h-[80vh] max-w-[80vw] rounded-lg object-contain'
        />
      </div>
    </div>
  );
}
