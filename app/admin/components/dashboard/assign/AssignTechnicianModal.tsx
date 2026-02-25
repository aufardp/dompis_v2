'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTechnicians } from '@/app/hooks/useTechnician';
import { fetchWithAuth } from '@/app/libs/fetcher';
import TechnicianCard from './TechnicianCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | number;
  ticketCode?: string;
  ticketWorkzone?: string | null;
  currentTechnicianId?: number;
  currentTechnicianName?: string | null;
  onAssign: () => Promise<void>;
}

export default function AssignTechnicianModal({
  isOpen,
  onClose,
  ticketId,
  ticketCode,
  ticketWorkzone,
  currentTechnicianId,
  currentTechnicianName,
  onAssign,
}: Props) {
  const { technicians, meta, loading, error, fetchTechnicians } =
    useTechnicians();

  const [selectedId, setSelectedId] = useState<number | undefined>(
    currentTechnicianId,
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTechnicians({ ticketId });
      setSubmitError(null);
      setSearchTerm('');
    }
  }, [isOpen, ticketId, fetchTechnicians]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const currentIsEligible = useMemo(() => {
    if (!currentTechnicianId) return true;
    return technicians.some(
      (t: any) => Number(t.id_user) === currentTechnicianId,
    );
  }, [technicians, currentTechnicianId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!currentTechnicianId) {
      setSelectedId(undefined);
      return;
    }

    const eligible = technicians.some(
      (t: any) => Number(t.id_user) === currentTechnicianId,
    );

    setSelectedId(eligible ? currentTechnicianId : undefined);
  }, [isOpen, technicians, currentTechnicianId]);

  if (!isOpen) return null;

  const filteredTechnicians = useMemo(() => {
    return technicians.filter((tech: any) =>
      `${tech.nama ?? ''} ${tech.nik ?? ''}`
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
      const res = await fetchWithAuth('/api/tickets/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: Number(ticketId),
          teknisiUserId: Number(selectedId),
        }),
      });

      if (!res) throw new Error('Network response was not ok');

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
      const res = await fetchWithAuth('/api/tickets/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: Number(ticketId),
        }),
      });

      if (!res) throw new Error('Network response was not ok');

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
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-label='Assign technician modal'
    >
      <div
        className='animate-in fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='border-b bg-gray-50 px-6 py-5'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h2 className='text-lg font-semibold text-gray-800'>
                Assign Technician
              </h2>
              <p className='mt-0.5 text-xs text-gray-500'>
                {ticketCode ? `${ticketCode} - ` : ''}Ticket ID #{ticketId}
              </p>
            </div>

            <button
              type='button'
              onClick={onClose}
              className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100'
              aria-label='Close'
            >
              <X size={18} />
            </button>
          </div>

          <div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
            <span className='inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-600 ring-1 ring-gray-200'>
              Workzone:{' '}
              <span className='ml-1 font-semibold text-gray-800'>
                {meta?.serviceAreaName ||
                  meta?.workzone ||
                  ticketWorkzone ||
                  '-'}
              </span>
            </span>
            <span className='inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-600 ring-1 ring-gray-200'>
              Eligible:{' '}
              <span className='ml-1 font-semibold'>{technicians.length}</span>
            </span>
            {currentTechnicianId && (
              <span className='inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-600 ring-1 ring-gray-200'>
                Current:{' '}
                <span className='ml-1 font-semibold text-gray-800'>
                  {currentTechnicianName || `#${currentTechnicianId}`}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {(error || submitError) && (
          <div className='mx-6 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600'>
            {submitError || error}
          </div>
        )}

        {!loading && meta && meta.serviceAreaId == null && (
          <div className='mx-6 mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700'>
            Cannot map this ticket workzone to a service area. No eligible
            technicians available.
          </div>
        )}

        {!loading &&
          currentTechnicianId &&
          !currentIsEligible &&
          meta?.serviceAreaId != null && (
            <div className='mx-6 mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800'>
              Current technician does not match this ticket workzone. Pick an
              eligible technician or remove the assignment.
            </div>
          )}

        {/* Content */}
        <div className='flex-1 space-y-4 overflow-y-auto px-6 py-5'>
          {/* Search */}
          <div className='relative'>
            <Search
              size={16}
              className='absolute top-1/2 left-3 -translate-y-1/2 text-gray-400'
            />
            <input
              ref={searchRef}
              type='text'
              placeholder='Search by name or NIK...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-10 pl-9 text-sm transition focus:border-blue-500 focus:bg-white focus:outline-none'
            />

            {searchTerm.trim().length > 0 && (
              <button
                type='button'
                onClick={() => setSearchTerm('')}
                className='absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-200/60'
                aria-label='Clear search'
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className='py-8 text-center text-sm text-gray-400'>
              Loading technicians...
            </div>
          )}

          {/* Empty */}
          {!loading && filteredTechnicians.length === 0 && (
            <div className='flex flex-col items-center justify-center py-10 text-gray-400'>
              <p className='text-sm'>No technician found</p>
              <p className='text-xs'>Try a different keyword</p>
            </div>
          )}

          {/* List */}
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
        <div className='space-y-3 border-t bg-white px-6 py-5'>
          <div className='flex gap-3'>
            <button
              onClick={onClose}
              disabled={submitting}
              className='flex-1 rounded-xl border border-gray-300 py-2.5 text-sm transition hover:bg-gray-50 disabled:opacity-50'
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                loading ||
                !selectedId ||
                (currentTechnicianId != null &&
                  selectedId === currentTechnicianId)
              }
              className='flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50'
            >
              {submitting
                ? 'Processing...'
                : currentTechnicianId
                  ? 'Reassign'
                  : 'Assign'}
            </button>
          </div>

          {currentTechnicianId && (
            <button
              onClick={handleUnassign}
              disabled={submitting}
              className='w-full rounded-xl border border-red-200 py-2.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50'
            >
              Remove Assignment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
