'use client';

import { useState } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdated: () => void;
}

export default function TicketUpdateModal({
  ticket,
  onClose,
  onUpdated,
}: Props) {
  const [pendingReason, setPendingReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const PHOTO_MIN = 2;
  const PHOTO_MAX = 5;

  const isReasonIncomplete = !pendingReason.trim();
  const isEvidenceIncomplete = selectedFiles.length < PHOTO_MIN;
  const canSubmit = !isReasonIncomplete && !isEvidenceIncomplete && !loading;

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleFileChange = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    if (fileArray.length > PHOTO_MAX) {
      setError(`Maksimal ${PHOTO_MAX} foto`);
      return;
    }
    setError(null);
    setSelectedFiles(fileArray);
    setPreviewUrls(fileArray.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadEvidence = async () => {
    const formData = new FormData();
    formData.append('incident', ticket.ticket);
    formData.append('ticketId', String(ticket.idTicket));
    formData.append('actionType', 'pending');
    selectedFiles.forEach((file) => formData.append('files', file));

    const res = await fetchWithAuth('/api/tickets/upload-evidence', {
      method: 'POST',
      body: formData,
    });

    if (!res) {
      throw new Error('Upload gagal: tidak ada respon dari server');
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.message || `Upload gagal: ${res.status}`);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      setUploading(true);
      await uploadEvidence();

      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket, pendingReason }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) onUpdated();
      else setError(data.message || 'Gagal update');
    } catch {
      setError('Terjadi kesalahan saat upload/update');
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  // ── Derived submit label ──────────────────────────────────────────────────
  const submitLabel = () => {
    if (uploading)
      return (
        <>
          <Spinner /> Mengupload...
        </>
      );
    if (loading)
      return (
        <>
          <Spinner /> Memproses...
        </>
      );
    if (isEvidenceIncomplete)
      return (
        <>
          <InfoIcon />
          Foto {selectedFiles.length}/{PHOTO_MIN} — kurang{' '}
          {PHOTO_MIN - selectedFiles.length}
        </>
      );
    if (isReasonIncomplete)
      return (
        <>
          <InfoIcon /> Isi Deskripsi dulu
        </>
      );
    return (
      <>
        <SaveIcon /> Simpan Update
      </>
    );
  };

  return (
    // Backdrop
    <div
      className='fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm'
      onClick={onClose}
    >
      {/* Bottom sheet */}
      <div
        className='animate-slide-up flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className='mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200' />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className='flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4'>
          <div>
            <h2 className='text-[16px] font-black text-slate-900'>
              Update Progress
            </h2>
            <p className='mt-0.5 font-mono text-[11px] font-semibold tracking-wider text-slate-400'>
              {ticket.ticket}
            </p>
          </div>
          <button
            onClick={onClose}
            className='flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200'
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          {/* Error banner */}
          {error && (
            <div className='flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600'>
              <span className='text-base'>⚠️</span>
              {error}
            </div>
          )}

          {/* ── Deskripsi / Alasan ────────────────────────────────────────── */}
          <div className='overflow-hidden rounded-2xl border border-slate-100 bg-white'>
            {/* Section header */}
            <div className='flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3'>
              <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-sm'>
                📝
              </div>
              <span className='text-[11px] font-black tracking-widest text-slate-500 uppercase'>
                Deskripsi / Alasan
              </span>
              {/* Required indicator */}
              <span className='ml-auto text-[10px] font-bold text-red-400'>
                * Wajib
              </span>
            </div>

            <div className='px-4 py-3'>
              <textarea
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                rows={4}
                placeholder='Jelaskan progress pekerjaan atau alasan pending secara detail...'
                className={`w-full resize-none rounded-xl border-[1.5px] px-3.5 py-2.5 text-[13.5px] leading-relaxed font-medium text-slate-800 transition-all outline-none placeholder:text-slate-300 ${
                  pendingReason.trim()
                    ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                    : 'border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                }`}
              />
              {/* Char counter */}
              <div className='mt-1.5 flex justify-end'>
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    pendingReason.length > 450
                      ? 'text-amber-500'
                      : 'text-slate-400'
                  }`}
                >
                  {pendingReason.length} / 500
                </span>
              </div>
            </div>
          </div>

          {/* ── Evidence Foto ─────────────────────────────────────────────── */}
          <div className='overflow-hidden rounded-2xl border border-slate-100 bg-white'>
            {/* Section header */}
            <div className='flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3'>
              <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-sm'>
                📷
              </div>
              <span className='text-[11px] font-black tracking-widest text-slate-500 uppercase'>
                Evidence Foto
              </span>
              {/* Photo count badge */}
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                  selectedFiles.length >= PHOTO_MIN
                    ? 'border-green-200 bg-green-50 text-green-600'
                    : 'border-red-200 bg-red-50 text-red-600'
                }`}
              >
                {selectedFiles.length}/{PHOTO_MIN} min
              </span>
            </div>

            <div className='space-y-3 px-4 py-3'>
              {/* Upload zone */}
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 transition-colors ${
                  selectedFiles.length > 0
                    ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
                }`}
              >
                <span className='text-2xl'>
                  {selectedFiles.length > 0 ? '📎' : '📁'}
                </span>
                <div className='text-center'>
                  <p className='text-[13px] font-bold text-slate-600'>
                    {selectedFiles.length > 0
                      ? 'Ganti / Tambah Foto'
                      : 'Pilih Foto'}
                  </p>
                  <p className='mt-0.5 text-[11px] text-slate-400'>
                    Min {PHOTO_MIN} foto · Max {PHOTO_MAX} foto · JPG, PNG
                  </p>
                </div>
                <input
                  type='file'
                  multiple
                  accept='image/*'
                  hidden
                  onChange={(e) => handleFileChange(e.target.files)}
                />
              </label>

              {/* Preview grid */}
              {previewUrls.length > 0 && (
                <div className='grid grid-cols-3 gap-2'>
                  {previewUrls.map((url, i) => (
                    <div key={i} className='group relative aspect-square'>
                      <img
                        src={url}
                        alt={`Evidence ${i + 1}`}
                        className='h-full w-full rounded-xl border border-slate-200 object-cover'
                      />
                      {/* Index badge */}
                      <span className='absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] font-black text-white'>
                        {i + 1}
                      </span>
                      {/* Remove button */}
                      <button
                        type='button'
                        onClick={() => removeImage(i)}
                        className='absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100'
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add more slot — show if below max */}
                  {selectedFiles.length < PHOTO_MAX && (
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
            </div>
          </div>

          {/* Bottom spacer for footer */}
          <div className='h-2' />
        </div>

        {/* ── Footer CTA ───────────────────────────────────────────────────── */}
        <div className='flex shrink-0 gap-2.5 border-t border-slate-100 bg-white px-5 py-4 pb-8'>
          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={loading}
            className='flex h-12.5 w-22 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50'
          >
            Batal
          </button>

          {/* Submit — full emphasis */}
          <button
            onClick={handleUpdate}
            disabled={!canSubmit}
            className={`flex h-12.5 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-black tracking-[0.01em] transition-all active:scale-[0.97] disabled:cursor-not-allowed ${
              canSubmit
                ? 'bg-linear-to-br from-blue-600 to-indigo-600 text-white shadow-[0_4px_14px_rgba(99,102,241,0.30)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.40)]'
                : 'border-[1.5px] border-slate-200 bg-slate-100 text-slate-400'
            }`}
          >
            {submitLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Micro components ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
  );
}

function InfoIcon() {
  return (
    <svg
      className='h-3.5 w-3.5 shrink-0'
      viewBox='0 0 16 16'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
    >
      <circle cx='8' cy='8' r='7' />
      <path d='M8 5v4M8 11v.5' />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      className='h-4 w-4'
      viewBox='0 0 16 16'
      fill='none'
      stroke='currentColor'
      strokeWidth='2.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M13.5 4.5l-8 8L2 9' />
    </svg>
  );
}
