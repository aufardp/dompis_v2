'use client';

import { useState, useCallback } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import EvidenceUploader from './detail-modal/EvidenceUploader';

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

  // ── Image compression (identik dengan TicketDetailModal) ──────────────────
  const compressImage = useCallback(
    async (file: File, maxWidthPx = 1920, quality = 0.82): Promise<File> => {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxWidthPx / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            },
            'image/jpeg',
            quality,
          );
        };
        img.onerror = () => resolve(file);
        img.src = url;
      });
    },
    [],
  );

  // ── File handlers dengan compression ──────────────────────────────────────
  const handleFileChange = useCallback(
    async (files: File[]) => {
      // 1. Compress all files first
      const compressed = await Promise.all(
        files.map((f) =>
          f.type.startsWith('image/') ? compressImage(f) : Promise.resolve(f),
        ),
      );

      // 2. Re-validate size AFTER compression
      const MAX_AFTER = 2 * 1024 * 1024;
      const stillTooLarge = compressed.filter(f => f.size > MAX_AFTER);
      if (stillTooLarge.length > 0) {
        setError(
          `${stillTooLarge.length} file masih terlalu besar setelah kompresi. Coba foto dengan resolusi lebih rendah.`
        );
        return;
      }

      // 3. Check total size
      const totalSize = compressed.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > 10 * 1024 * 1024) {
        setError('Total ukuran foto melebihi 10MB. Kurangi jumlah foto.');
        return;
      }

      setSelectedFiles(compressed);
      setPreviewUrls(compressed.map((f) => URL.createObjectURL(f)));
    },
    [compressImage],
  );

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
      // Tangkap 413 khusus dengan pesan ramah
      if (res.status === 413) {
        throw new Error(
          'Foto terlalu besar untuk dikirim. Coba pilih lebih sedikit foto atau foto dengan ukuran lebih kecil.',
        );
      }
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
        className='animate-slide-up flex w-full flex-col rounded-t-3xl bg-white shadow-2xl'
        style={{ maxHeight: 'calc(100dvh - 4rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className='mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-200' />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className='flex shrink-0 items-start justify-between border-b border-slate-100 px-4 py-3.5'>
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
        <div className='flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4'>
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

            <div className='px-4 py-3'>
              {/* Use EvidenceUploader component */}
              <EvidenceUploader
                onFilesChange={handleFileChange}
                onRemoveImage={handleRemoveImage}
                previewUrls={previewUrls}
                uploading={uploading}
                existingCount={0}
              />
            </div>
          </div>

          {/* Bottom spacer for footer */}
          <div className='h-2' />
        </div>

        {/* ── Footer CTA ───────────────────────────────────────────────────── */}
        <div
          className='flex shrink-0 gap-3 border-t border-slate-100 bg-white px-4 pt-3'
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={loading}
            className='flex h-12 w-20 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50'
          >
            Batal
          </button>

          {/* Submit — full emphasis */}
          <button
            onClick={handleUpdate}
            disabled={!canSubmit}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-black tracking-[0.01em] transition-all active:scale-[0.97] disabled:cursor-not-allowed ${
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
