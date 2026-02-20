'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ticket } from '@/app/types/ticket';
import { rcaMapping } from '@/app/types/rca';
import { fetchWithAuth } from '@/app/libs/fetcher';
import EvidenceSliderModal from './EvidenceSliderModal';

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdated: () => void;
  onUpdateClick: () => void;
}

export default function TicketDetailModal({
  ticket,
  onClose,
  onUpdated,
  onUpdateClick,
}: Props) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [evidence, setEvidence] = useState<
    Array<{
      id: number;
      fileName: string;
      filePath: string;
      fileSize: number | null;
      mimeType: string | null;
      createdAt: string | null;
    }>
  >([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [selectedRca, setSelectedRca] = useState('');
  const [selectedSubRca, setSelectedSubRca] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const status = useMemo(
    () => ticket.hasilVisit?.toUpperCase() || 'OPEN',
    [ticket.hasilVisit],
  );

  const isAssigned = status === 'ASSIGNED';
  const isOnProgress = status === 'ON_PROGRESS';
  const isPending = status === 'PENDING';
  const isClosed = status === 'CLOSE';
  const isOpen = status === 'OPEN' || !ticket.hasilVisit;

  const isRcaIncomplete = !selectedRca || !selectedSubRca;
  const isEvidenceIncomplete = selectedFiles.length < 2;

  useEffect(() => {
    if (!isClosed) return;

    let cancelled = false;

    (async () => {
      setEvidenceLoading(true);
      setEvidenceError(null);

      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/evidence`,
        );
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (data?.success) {
          setEvidence(Array.isArray(data.data) ? data.data : []);
        } else {
          setEvidence([]);
          setEvidenceError(data?.message || 'Gagal mengambil evidence');
        }
      } catch {
        if (cancelled) return;
        setEvidence([]);
        setEvidenceError('Gagal mengambil evidence');
      } finally {
        if (cancelled) return;
        setEvidenceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isClosed, ticket.idTicket]);

  //handle resume
  const handleResume = async () => {
    setActionLoading('resume');
    setError(null);

    try {
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          resume: true,
        }),
      });

      if (!res) return;

      const data = await res.json();
      if (data.success) onUpdated();
      else setError(data.message || 'Gagal resume');
    } catch {
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  };

  /* =========================
     HANDLE PICKUP
  ========================== */
  const handlePickup = async () => {
    setError(null);
    setActionLoading('pickup');

    try {
      const res = await fetchWithAuth('/api/tickets/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket }),
      });

      if (!res) return;

      const data = await res.json();
      if (data.success) onUpdated();
      else setError(data.message || 'Gagal mengambil ticket');
    } catch {
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  };

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
     UPLOAD WITH PROGRESS
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
     HANDLE CLOSE
  ========================== */
  const handleCloseTicket = async () => {
    if (isRcaIncomplete) return;

    setError(null);
    setActionLoading('close');

    try {
      setUploading(true);

      await uploadEvidence();

      const res = await fetchWithAuth('/api/tickets/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          rca: selectedRca,
          subRca: selectedSubRca,
        }),
      });

      if (!res) return;

      const data = await res.json();

      if (data.success) onUpdated();
      else setError(data.message || 'Gagal menutup ticket');
    } catch {
      setError('Terjadi kesalahan saat upload/close');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setActionLoading(null);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ASSIGNED':
        return 'bg-amber-100 text-amber-700';
      case 'ON_PROGRESS':
        return 'bg-blue-100 text-blue-700';
      case 'PENDING':
        return 'bg-purple-100 text-purple-700';
      case 'CLOSE':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        className='max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className='sticky top-0 border-b bg-white p-5'>
          <div className='flex items-center justify-between'>
            <div>
              <div className='mb-2 flex items-center gap-3'>
                <span className='font-mono text-lg font-bold text-slate-500'>
                  {ticket.ticket}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusColor()}`}
                >
                  {status}
                </span>
              </div>
              <h2 className='text-base font-semibold text-slate-800'>
                {ticket.summary || ticket.symptom || 'Tanpa deskripsi'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className='rounded-lg p-2 hover:bg-slate-100'
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className='mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
            {error}
          </div>
        )}

        <div className='space-y-6 p-5'>
          {/* INFORMASI PELANGGAN */}
          <div className='rounded-xl bg-slate-50 p-4'>
            <h3 className='mb-3 text-sm font-semibold text-slate-500 uppercase'>
              Informasi Pelanggan
            </h3>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <div className='text-xs text-slate-400'>Nama</div>
                <div className='text-sm text-slate-700'>
                  {ticket.contactName || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>Telepon</div>
                <div className='text-sm text-slate-700'>
                  {ticket.contactPhone || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>No. Service</div>
                <div className='text-sm text-slate-700'>
                  {ticket.serviceNo || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>Tgl. Laporan</div>
                <div className='text-sm text-slate-700'>
                  {ticket.reportedDate || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* DETAIL TICKET */}
          <div className='rounded-xl bg-slate-50 p-4'>
            <h3 className='mb-3 text-sm font-semibold text-slate-500 uppercase'>
              Detail Ticket
            </h3>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <div className='text-xs text-slate-400'>Jenis Layanan</div>
                <div className='text-sm text-slate-700'>
                  {ticket.serviceType || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>Jenis Pelanggan</div>
                <div className='text-sm text-slate-700'>
                  {ticket.customerType || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>Device</div>
                <div className='text-sm text-slate-700'>
                  {ticket.deviceName || '-'}
                </div>
              </div>
              <div>
                <div className='text-xs text-slate-400'>Workzone</div>
                <div className='text-sm text-slate-700'>
                  {ticket.workzone || '-'}
                </div>
              </div>
              <div className='col-span-2'>
                <div className='text-xs text-slate-400'>Symptom</div>
                <div className='text-sm text-slate-700'>
                  {ticket.symptom || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* RCA */}
          {isOnProgress && (
            <div className='space-y-4 rounded-xl bg-slate-50 p-4'>
              <h3 className='text-sm font-semibold text-slate-500 uppercase'>
                RCA
              </h3>

              <select
                value={selectedRca}
                onChange={(e) => {
                  setSelectedRca(e.target.value);
                  setSelectedSubRca('');
                }}
                className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
              >
                <option value=''>-- Pilih RCA --</option>
                {Object.keys(rcaMapping).map((rca) => (
                  <option key={rca} value={rca}>
                    {rca}
                  </option>
                ))}
              </select>

              {selectedRca && (
                <select
                  value={selectedSubRca}
                  onChange={(e) => setSelectedSubRca(e.target.value)}
                  className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
                >
                  <option value=''>-- Pilih Sub RCA --</option>
                  {rcaMapping[selectedRca].map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* CLOSED: RCA RESULT */}
          {isClosed && (
            <div className='rounded-xl bg-slate-50 p-4'>
              <h3 className='mb-3 text-sm font-semibold text-slate-500 uppercase'>
                Closing Results
              </h3>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <div className='text-xs text-slate-400'>RCA</div>
                  <div className='text-sm font-medium text-slate-700'>
                    {ticket.rca || '-'}
                  </div>
                </div>
                <div>
                  <div className='text-xs text-slate-400'>Sub RCA</div>
                  <div className='text-sm font-medium text-slate-700'>
                    {ticket.subRca || '-'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EVIDENCE */}
          {isOnProgress && (
            <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4'>
              <h3 className='text-sm font-semibold text-slate-600'>
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
                      className='h-2 rounded bg-blue-500 transition-all'
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className='mt-1 text-right text-xs text-slate-500'>
                    Uploading {uploadProgress}%
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CLOSED: EVIDENCE GALLERY */}
          {isClosed && (
            <div className='space-y-3 rounded-xl border border-slate-200 bg-white p-4'>
              <h3 className='text-sm font-semibold text-slate-600'>
                Evidence Foto
              </h3>

              {evidenceError && (
                <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
                  {evidenceError}
                </div>
              )}

              {evidenceLoading ? (
                <div className='text-sm text-slate-500'>Memuat evidence...</div>
              ) : evidence.length === 0 ? (
                <div className='text-sm text-slate-500'>Tidak ada evidence</div>
              ) : (
                <div className='grid grid-cols-3 gap-2'>
                  {evidence.map((ev, idx) => (
                    <button
                      key={ev.id}
                      type='button'
                      onClick={() => {
                        setViewerIndex(idx);
                        setViewerOpen(true);
                      }}
                      className='relative overflow-hidden rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none'
                      aria-label={`Open evidence ${idx + 1}`}
                    >
                      <img
                        src={ev.filePath}
                        alt={ev.fileName}
                        className='h-24 w-full object-cover'
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className='sticky bottom-0 flex gap-3 border-t bg-white p-5'>
          {/* UPDATE BUTTON */}
          {isOnProgress && (
            <button
              onClick={onUpdateClick}
              className='flex-1 rounded-xl bg-purple-600 py-3 text-white hover:bg-purple-700'
            >
              ✏️ Update
            </button>
          )}

          {/* PICKUP */}
          {isAssigned && (
            <button
              onClick={handlePickup}
              disabled={actionLoading === 'pickup'}
              className='flex-1 rounded-xl bg-blue-600 py-3 text-white hover:bg-blue-700 disabled:opacity-50'
            >
              {actionLoading === 'pickup' ? 'Memproses...' : '🚀 Pickup'}
            </button>
          )}

          {/* RESUME (PENDING → ON_PROGRESS) */}
          {isPending && (
            <button
              onClick={handleResume}
              disabled={actionLoading === 'resume'}
              className='flex-1 rounded-xl bg-blue-600 py-3 text-white hover:bg-blue-700 disabled:opacity-50'
            >
              {actionLoading === 'resume' ? 'Memproses...' : '▶ Resume'}
            </button>
          )}

          {/* CLOSE */}
          {isOnProgress && (
            <button
              onClick={handleCloseTicket}
              disabled={
                actionLoading === 'close' ||
                isRcaIncomplete ||
                isEvidenceIncomplete
              }
              className={`flex-1 rounded-xl py-3 font-medium text-white transition ${
                actionLoading === 'close' ||
                isRcaIncomplete ||
                isEvidenceIncomplete
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {actionLoading === 'close'
                ? 'Memproses...'
                : isEvidenceIncomplete
                  ? 'Minimal 2 Foto'
                  : isRcaIncomplete
                    ? 'Lengkapi RCA'
                    : '✅ Close'}
            </button>
          )}

          {/* CLOSED STATE */}
          {isClosed && (
            <div className='flex-1 rounded-xl bg-green-100 py-3 text-center font-medium text-green-700'>
              ✓ Ticket Close
            </div>
          )}
        </div>
      </div>

      <EvidenceSliderModal
        images={evidence.map((e) => ({ src: e.filePath, alt: e.fileName }))}
        isOpen={viewerOpen}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
