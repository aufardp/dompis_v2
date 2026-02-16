'use client';

import { useEffect, useState } from 'react';
import { useTicketForm } from './useTicketForm';
import TicketForm from './TicketForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewTicketModal({ isOpen, onClose, onCreated }: Props) {
  const [areas, setAreas] = useState([]);
  const { formData, loading, errors, handleChange, submit } =
    useTicketForm(onCreated);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/area', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setAreas(data.data);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm'>
      <div className='max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl'>
        <div className='border-b p-6'>
          <h2 className='text-xl font-semibold'>Create New Ticket</h2>
        </div>

        <div className='space-y-5 p-6'>
          {errors.length > 0 && (
            <div className='rounded-lg bg-red-50 p-4 text-sm text-red-600'>
              {errors.join(', ')}
            </div>
          )}

          <TicketForm
            formData={formData}
            handleChange={handleChange}
            areas={areas}
          />

          <div className='flex justify-end gap-3 pt-4'>
            <button onClick={onClose} className='rounded-lg border px-4 py-2'>
              Cancel
            </button>

            <button
              onClick={submit}
              disabled={loading}
              className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50'
            >
              {loading ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
