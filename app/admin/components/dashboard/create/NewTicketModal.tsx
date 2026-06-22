'use client';

import { useEffect, useState } from 'react';
import { useTicketForm } from './useTicketForm';
import TicketForm from './TicketForm';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function Spinner() {
  return (
    <svg className='inline h-4 w-4 animate-spin' viewBox='0 0 24 24' fill='none'>
      <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
      <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
    </svg>
  );
}

export default function NewTicketModal({ isOpen, onClose, onCreated }: Props) {
  const [areas, setAreas] = useState<Array<{ id: number; name: string }>>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const { formData, loading, errors, handleChange, submit } =
    useTicketForm(onCreated);

  useEffect(() => {
    if (isOpen) {
      setAreasLoading(true);
      fetchWithAuth('/api/area')
        .then((res) => (res ? res.json() : null))
        .then((data) => {
          if (data?.success) setAreas(data.data);
        })
        .finally(() => setAreasLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm'>
      <div className='relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl'>
        {loading && (
          <div className='absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]'>
            <Spinner />
          </div>
        )}
        <div className='border-b p-6'>
          <h2 className='text-xl font-semibold'>Create New Ticket</h2>
        </div>

        <div className='space-y-5 p-6'>
          {errors.length > 0 && (
            <div className='rounded-lg bg-red-50 p-4 text-sm text-red-600'>
              {errors.join(', ')}
            </div>
          )}

          {areasLoading ? (
            <div className='space-y-3'>
              <div className='h-10 animate-pulse rounded-md bg-gray-100' />
              <div className='h-10 animate-pulse rounded-md bg-gray-100' />
            </div>
          ) : (
            <TicketForm
              formData={formData}
              handleChange={handleChange}
              areas={areas}
              disabled={loading}
            />
          )}

          <div className='flex justify-end gap-3 pt-4'>
            <button
              onClick={onClose}
              disabled={loading}
              className='rounded-lg border px-4 py-2 disabled:opacity-50'
            >
              Cancel
            </button>

            <button
              onClick={submit}
              disabled={loading}
              className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50'
            >
              {loading ? (
                <span className='inline-flex items-center gap-2'>
                  <Spinner /> Creating...
                </span>
              ) : (
                'Create Ticket'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
