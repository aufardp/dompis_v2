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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const isPendingReasonIncomplete = !pendingReason.trim();
  const isEvidenceIncomplete = selectedFiles.length < 2;

  /* =========================
     FILE HANDLER
  ========================== */
  const handleFileChange = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);

    if (fileArray.length > 5) {
      setError('Maksimal 5 foto');
      return;
    }

    setSelectedFiles(fileArray);
    setPreviewUrls(fileArray.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    const updatedFiles = [...selectedFiles];
    const updatedPreviews = [...previewUrls];

    updatedFiles.splice(index, 1);
    updatedPreviews.splice(index, 1);

    setSelectedFiles(updatedFiles);
    setPreviewUrls(updatedPreviews);
  };

  /* =========================
     UPLOAD EVIDENCE
  ========================== */
  const uploadEvidence = async () => {
    if (!selectedFiles.length) return;

    return new Promise<void>((resolve, reject) => {
      const formData = new FormData();
      formData.append('incident', ticket.ticket);
      formData.append('ticketId', String(ticket.idTicket));

      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/tickets/upload-evidence');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (xhr.status === 200) resolve();
        else reject();
      };

      xhr.onerror = () => reject();

      xhr.send(formData);
    });
  };

  /* =========================
     HANDLE UPDATE
  ========================== */
  const handleUpdate = async () => {
    if (isPendingReasonIncomplete || isEvidenceIncomplete) return;

    setLoading(true);
    setError(null);

    try {
      setUploading(true);

      // Upload evidence dulu
      await uploadEvidence();

      // Lalu set PENDING
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          pendingReason,
        }),
      });

      if (!res) return;
      const data = await res.json();

      if (data.success) onUpdated();
      else setError(data.message || 'Gagal update');
    } catch {
      setError('Terjadi kesalahan saat upload/update');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setLoading(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        className='max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className='mb-4 text-lg font-semibold'>Update Progress</h2>

        {error && (
          <div className='mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600'>
            {error}
          </div>
        )}

        {/* DESCRIPTION */}
        <div className='mb-5'>
          <label className='text-sm font-medium text-slate-600'>
            Deskripsi / Alasan
          </label>
          <textarea
            value={pendingReason}
            onChange={(e) => setPendingReason(e.target.value)}
            rows={4}
            className='mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
            placeholder='Masukkan alasan pending pekerjaan...'
          />
        </div>

        {/* EVIDENCE */}
        <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4'>
          <h3 className='text-sm font-semibold text-slate-600'>
            Evidence Foto (Minimal 2 - Max 5)
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
            <div className='grid grid-cols-3 gap-2'>
              {previewUrls.map((url, index) => (
                <div key={index} className='relative'>
                  <img
                    src={url}
                    className='h-24 w-full rounded-lg border object-cover'
                  />
                  <button
                    type='button'
                    onClick={() => removeImage(index)}
                    className='absolute top-1 right-1 rounded-full bg-black/60 px-2 text-xs text-white'
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div>
              <div className='h-2 w-full rounded bg-gray-200'>
                <div
                  className='h-2 rounded bg-purple-600 transition-all'
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className='mt-1 text-right text-xs text-slate-500'>
                Uploading {uploadProgress}%
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className='mt-6 flex gap-3'>
          <button onClick={onClose} className='flex-1 rounded-xl border py-3'>
            Batal
          </button>

          <button
            onClick={handleUpdate}
            disabled={
              loading || isPendingReasonIncomplete || isEvidenceIncomplete
            }
            className={`flex-1 rounded-xl py-3 text-white ${
              loading || isPendingReasonIncomplete || isEvidenceIncomplete
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {loading
              ? 'Memproses...'
              : isEvidenceIncomplete
                ? 'Minimal 2 Foto'
                : isPendingReasonIncomplete
                  ? 'Isi Alasan'
                  : '💾 Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
