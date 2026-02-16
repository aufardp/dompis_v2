'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTechnicians } from '@/app/hooks/useTechnician';
import TechnicianCard from './TechnicianCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | number;
  currentTechnicianId?: number;
  onAssign: () => Promise<void>;
}

export default function AssignTechnicianModal({
  isOpen,
  onClose,
  ticketId,
  currentTechnicianId,
  onAssign,
}: Props) {
  const { technicians, loading, error, fetchTechnicians } = useTechnicians();

  const [selectedId, setSelectedId] = useState<number | undefined>(
    currentTechnicianId,
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTechnicians();
      setSelectedId(currentTechnicianId);
      setSubmitError(null);
      setSearchTerm('');
    }
  }, [isOpen, currentTechnicianId]);

  if (!isOpen) return null;

  // 🔍 Filter teknisi berdasarkan nama & NIK
  const filteredTechnicians = useMemo(() => {
    return technicians.filter((tech: any) =>
      `${tech.nama} ${tech.nik}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    );
  }, [technicians, searchTerm]);

  const handleSubmit = async () => {
    if (!selectedId) {
      setSubmitError('Please select a technician');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/tickets/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketId: Number(ticketId),
          teknisiUserId: Number(selectedId),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to assign ticket');
      }

      await onAssign();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to assign ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassign = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/tickets/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketId: Number(ticketId),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to unassign ticket');
      }

      await onAssign();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to unassign ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm'>
      <div className='flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl'>
        {/* Header */}
        <div className='border-b p-5'>
          <h2 className='text-lg font-semibold'>Assign Technician</h2>
          <p className='text-xs text-gray-500'>Ticket: #{ticketId}</p>
        </div>

        {/* Error Message */}
        {(error || submitError) && (
          <div className='mx-5 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600'>
            {submitError || error}
          </div>
        )}

        {/* Content */}
        <div className='flex-1 space-y-3 overflow-y-auto p-5'>
          {/* 🔍 Search Input */}
          <input
            type='text'
            placeholder='Search by name or NIK...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
          />

          {loading && (
            <p className='py-8 text-center text-gray-500'>
              Loading technicians...
            </p>
          )}

          {!loading && filteredTechnicians.length === 0 && (
            <p className='py-8 text-center text-gray-500'>
              No technicians found
            </p>
          )}

          {filteredTechnicians.map((tech: any) => (
            <TechnicianCard
              key={tech.id_user}
              tech={tech}
              isSelected={selectedId === tech.id_user}
              isCurrent={currentTechnicianId === tech.id_user}
              onSelect={() => setSelectedId(tech.id_user)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className='flex flex-col gap-2 border-t p-5'>
          <div className='flex gap-3'>
            <button
              onClick={onClose}
              disabled={submitting}
              className='flex-1 rounded-lg border py-2 text-sm disabled:opacity-50'
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedId}
              className='flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-50'
            >
              {submitting
                ? 'Assigning...'
                : currentTechnicianId
                  ? 'Reassign'
                  : 'Assign'}
            </button>
          </div>

          {currentTechnicianId && (
            <button
              onClick={handleUnassign}
              disabled={submitting}
              className='w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50'
            >
              Remove Assignment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
