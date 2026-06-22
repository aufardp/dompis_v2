'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Ticket } from '@/app/types/ticket';
import { rcaMapping } from '@/app/types/rca';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import EvidenceSliderModal from './EvidenceSliderModal';
import {
  getSlaHours,
  parseWIBDateInput,
  calculateTicketAge,
} from '@/app/utils/datetime';
import { addHours } from 'date-fns';

import SectionCard from './detail-modal/SectionCard';
import ModalHeader from './detail-modal/ModalHeader';
import ModalFooter from './detail-modal/ModalFooter';
import AddMemberModal from './AddMemberModal';
import EvidenceUploader from './detail-modal/EvidenceUploader';
import EvidenceGallery from './detail-modal/EvidenceGallery';
import SlaSection from './detail-modal/SlaSection';
import CompletionChecklist from './detail-modal/CompletionChecklist';
import CustomerInfoSection from './detail-modal/CustomerInfoSection';
import DetailTicketSection from './detail-modal/DetailTicketSection';
import ClosingResults from './detail-modal/ClosingResults';
import { filesToDataUrls } from './detail-modal/file-preview';

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdated: (type?: 'close' | 'pickup' | 'resume') => void;
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
  const [headerWarning, setHeaderWarning] = useState<string | null>(null);

  const [currentAlamat, setCurrentAlamat] = useState<string>(
    ticket.alamat?.trim() ?? '',
  );

  useEffect(() => {
    setCurrentAlamat(ticket.alamat?.trim() ?? '');
  }, [ticket.alamat]);

  const [evidence, setEvidence] = useState<
    Array<{
      id: number;
      fileName: string;
      filePath: string;
      url: string;
      driveUrl: string | null;
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

  const [detailPerbaikan, setDetailPerbaikan] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const addressSectionRef = useRef<HTMLDivElement>(null);
  const evidenceUploaderRef = useRef<HTMLDivElement>(null);

  // Status derived values
  const status = useMemo(() => {
    const raw = ticket.status_update ?? ticket.hasilVisit ?? '';
    return raw.toUpperCase().trim() || 'OPEN';
  }, [ticket.status_update, ticket.hasilVisit]);

  const isAssigned = status === 'ASSIGNED';
  const isOnProgress = status === 'ON_PROGRESS';
  const isPending = status === 'PENDING';
  const isClosed = useMemo(
    () => isTicketClosed(ticket.status_update ?? ticket.hasilVisit),
    [ticket.status_update, ticket.hasilVisit],
  );

  const isRcaIncomplete = !selectedRca || !selectedSubRca;
  const CLOSE_PHOTO_MIN = 2; // close wajib 2 foto, max 5 foto
  const isEvidenceIncomplete = selectedFiles.length < CLOSE_PHOTO_MIN;
  const photoRequired = CLOSE_PHOTO_MIN;

  // Saat tiket CLOSED: gunakan jumlah evidence dari server (sudah tersimpan).
  // Saat ON_PROGRESS: gunakan jumlah file yang baru dipilih untuk diupload.
  // Saat loading: tampilkan photoRequired sebagai optimistic placeholder.
  const photoCount = isClosed
    ? evidenceLoading
      ? photoRequired // tampilkan target sementara loading (optimistic)
      : evidence.length
    : selectedFiles.length; // file baru yang dipilih untuk upload

  // Syarat ke-3: Alamat wajib terisi
  const ALAMAT_EMPTY_VALUES = [
    'tidak ada',
    'tidak tersedia',
    '-',
    'n/a',
    'none',
    '.',
  ];

  const isAlamatEmpty = (() => {
    const v = currentAlamat.trim().toLowerCase();
    return v.length === 0 || ALAMAT_EMPTY_VALUES.includes(v);
  })();

  const isDetailPerbaikanEmpty = detailPerbaikan.trim().length < 10;

  // Device Name validation - wajib terisi untuk close
  const DEVICE_EMPTY_VALUES = [
    'tidak ada',
    'tidak tersedia',
    '-',
    'n/a',
    'none',
    '.',
    'null',
    'undefined',
  ];

  const isDeviceNameEmpty = (() => {
    const v = String(ticket.deviceName ?? '')
      .trim()
      .toLowerCase();
    return v.length === 0 || DEVICE_EMPTY_VALUES.includes(v);
  })();

  useEffect(() => {
    if (!ticket.idTicket) return;
    if (!isAlamatEmpty) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/detail`,
        );
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        const remoteAlamat = String(data?.data?.alamat ?? '').trim();
        const v = remoteAlamat.toLowerCase();
        if (remoteAlamat.length === 0) return;
        if (ALAMAT_EMPTY_VALUES.includes(v)) return;

        setCurrentAlamat(remoteAlamat);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticket.idTicket, isAlamatEmpty]);

  // Address can be updated when ticket is ON_PROGRESS or PENDING, and not closed
  const canUpdateAlamat = (isOnProgress || isPending) && !isClosed;

  // (alamat validity now derived via ALAMAT_EMPTY_VALUES)

  // ISSUE 3: SLA Progress Bar calculation
  const slaPercent = useMemo(() => {
    const start = parseWIBDateInput(ticket.reportedDate)?.getTime() ?? 0;
    const reported = parseWIBDateInput(ticket.reportedDate);
    if (!reported || !start) return 0;

    const slaHours = getSlaHours(ticket.customerType);
    const end = addHours(reported, slaHours).getTime();

    if (!end || end <= start) return 0;

    const now = Date.now();
    return Math.min(100, Math.round(((now - start) / (end - start)) * 100));
  }, [ticket.reportedDate, ticket.customerType]);

  const slaBarColor =
    slaPercent >= 90
      ? 'bg-red-500'
      : slaPercent >= 70
        ? 'bg-orange-400'
        : slaPercent >= 40
          ? 'bg-yellow-400'
          : 'bg-green-400';

  // ISSUE 4: Max TTR remaining time calculation
  const ttrRemaining = useMemo(() => {
    const reported = parseWIBDateInput(ticket.reportedDate);
    if (!reported) return null;

    const slaHours = getSlaHours(ticket.customerType);
    const deadline = addHours(reported, slaHours);
    const diff = deadline.getTime() - Date.now();
    const isOverdue = diff < 0;
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    return { label: `${isOverdue ? '-' : ''}${h}j ${m}m`, isOverdue };
  }, [ticket.reportedDate, ticket.customerType]);

  // Ticket age memoized
  const ticketAge = useMemo(
    () =>
      calculateTicketAge(
        ticket.reportedDate,
        ticket.hasilVisit,
        ticket.closedAt,
      ),
    [ticket.reportedDate, ticket.hasilVisit, ticket.closedAt],
  );

  // Fetch evidence for closed and pending tickets
  useEffect(() => {
    if (!isClosed && !isPending) return;

    let cancelled = false;
    const evidenceScope = isPending ? 'pending' : isClosed ? 'close' : null;

    (async () => {
      setEvidenceLoading(true);
      setEvidenceError(null);

      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/evidence${evidenceScope ? `?scope=${evidenceScope}` : ''}`,
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
  }, [isClosed, isPending, ticket.idTicket]);

  // Resume handler
  const handleResume = useCallback(async () => {
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
      if (data.success) onUpdated('resume');
      else setError(data.message || 'Gagal resume');
    } catch {
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }, [ticket.idTicket, onUpdated]);

  // Pickup handler
  const handlePickup = useCallback(async () => {
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
      if (data.success) onUpdated('pickup');
      else setError(data.message || 'Gagal mengambil ticket');
    } catch {
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }, [ticket.idTicket, onUpdated]);

  // File handlers — files sudah dikompres di EvidenceUploader
  const handleFileChange = useCallback((files: File[]) => {
    // 1. Validate size (file sudah dikompres dari EvidenceUploader)
    // Naikkan batas dari 3MB ke 4MB — kompresi multi-pass jamin < 3MB, buffer aman
    const MAX_AFTER = 4 * 1024 * 1024;
    const stillTooLarge = files.filter((f) => f.size > MAX_AFTER);
    if (stillTooLarge.length > 0) {
      setError(
        `${stillTooLarge.length} foto masih terlalu besar setelah kompresi (maks 4MB per foto). ` +
          `Coba foto dengan pencahayaan lebih baik atau resolusi kamera lebih rendah.`,
      );
      return;
    }

    // 2. Check total size: 5 foto × 4MB = 20MB max → set 15MB total
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 15 * 1024 * 1024) {
      setError('Total ukuran foto melebihi 15MB. Kurangi jumlah foto.');
      return;
    }

    setSelectedFiles(files);
    void filesToDataUrls(files)
      .then(setPreviewUrls)
      .catch(() => setPreviewUrls([]));
  }, []);

  const handlePreviewFilesChange = useCallback((files: File[]) => {
    void filesToDataUrls(files)
      .then(setPreviewUrls)
      .catch(() => setPreviewUrls([]));
  }, []);

  const handleRemoveImage = useCallback(
    (index: number) => {
      const updatedFiles = [...selectedFiles];
      const updatedPreviews = [...previewUrls];

      updatedFiles.splice(index, 1);
      updatedPreviews.splice(index, 1);

      setSelectedFiles(updatedFiles);
      setPreviewUrls(updatedPreviews);
    },
    [selectedFiles, previewUrls],
  );

  // Callback untuk warning dari EvidenceUploader
  const handleUploadWarning = useCallback((warning: string | null) => {
    setHeaderWarning(warning);
  }, []);

  // Upload evidence menggunakan sequential per-file upload (hindari timeout di slow connection)
  const uploadEvidence = useCallback(async () => {
    if (!selectedFiles.length) return;

    // Upload files satu per satu secara sequential
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`Mengupload foto ${i + 1}/${selectedFiles.length}...`);

      const formData = new FormData();
      formData.append('incident', ticket.ticket);
      formData.append('ticketId', String(ticket.idTicket));
      formData.append('actionType', 'close');
      formData.append('files', file);

      const res = await fetchWithAuth('/api/tickets/upload-evidence', {
        method: 'POST',
        body: formData,
        timeoutMs: 120_000,
      });

      if (!res) {
        throw new Error('Upload gagal: tidak ada respon dari server');
      }

      if (!res.ok) {
        if (res.status === 413) {
          throw new Error(
            `Foto ${i + 1} masih terlalu besar. Coba foto ulang dengan kamera resolusi lebih rendah.`,
          );
        }
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.message || `Upload foto ${i + 1} gagal: ${res.status}`,
        );
      }
    }

    setUploadProgress(null);
  }, [selectedFiles, ticket.ticket, ticket.idTicket]);

  // Close ticket handler
  const handleCloseTicket = useCallback(async () => {
    if (isAlamatEmpty) {
      setError('Alamat pelanggan wajib diisi sebelum menutup tiket.');
      addressSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (isDeviceNameEmpty) {
      setError('Device Name wajib diisi sebelum menutup tiket.');
      return;
    }

    if (isRcaIncomplete) {
      setError('RCA dan Sub RCA wajib diisi sebelum menutup tiket.');
      return;
    }

    if (isDetailPerbaikanEmpty) {
      setError('Detail perbaikan wajib diisi minimal 10 karakter.');
      return;
    }

    if (selectedFiles.length < CLOSE_PHOTO_MIN) {
      setError(`Upload minimal ${CLOSE_PHOTO_MIN} foto untuk menutup tiket.`);
      return;
    }

    setError(null);
    setActionLoading('close');

    try {
      setUploading(true);

      // Upload evidence first
      await uploadEvidence();

      // Then close the ticket
      const res = await fetchWithAuth('/api/tickets/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          rca: selectedRca,
          subRca: selectedSubRca,
          descriptionSolutionDompis: detailPerbaikan.trim(),
        }),
      });

      if (!res) {
        throw new Error('Tidak ada respon dari server');
      }

      const data = await res.json();

      if (data.success) {
        onUpdated('close');
      } else {
        throw new Error(data.message || 'Gagal menutup ticket');
      }
    } catch (err: any) {
      // Show specific error message from server or network
      setError(err.message || 'Terjadi kesalahan saat upload/close');
    } finally {
      setUploading(false);
      setActionLoading(null);
    }
  }, [
    isAlamatEmpty,
    isDeviceNameEmpty,
    isRcaIncomplete,
    isDetailPerbaikanEmpty,
    uploadEvidence,
    ticket.idTicket,
    selectedRca,
    selectedSubRca,
    detailPerbaikan,
    onUpdated,
  ]);

  const handlePhotoClick = useCallback(() => {
    evidenceUploaderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm'
      onClick={onClose}
    >
      {/* Bottom Sheet */}
      <div
        className='flex w-full flex-col rounded-t-3xl bg-slate-50 shadow-2xl transition-all dark:bg-slate-900'
        style={{ height: 'calc(100dvh - 3.5rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className='mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600' />
        {/* Header */}
        <ModalHeader
          ticket={ticket.ticket}
          summary={ticket.summary}
          symptom={ticket.symptom}
          status={status}
          reportedDate={ticket.reportedDate}
          hasilVisit={ticket.hasilVisit}
          closedAt={ticket.closedAt}
          jenisTiket={ticket.jenisTiket}
          isClosed={isClosed}
          onClose={onClose}
          warning={headerWarning || error}
          warningType={headerWarning ? 'upload' : error ? 'error' : undefined}
          onDismissWarning={() => {
            setHeaderWarning(null);
            setError(null);
          }}
        />

        {/* ═══ SATU-SATUNYA scroll container ═══
            - flex-1 agar mengisi sisa tinggi
            - overflow-y-auto untuk scroll
            - overscroll-contain agar tidak trigger PTR browser
            - pb disesuaikan dengan isi footer yang sticky
            TIDAK BOLEH ada overflow-y-auto lain di dalamnya */}
        <div className='flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4'>
          <div className='space-y-4'>
            <SlaSection
              ticket={ticket}
              ttrRemaining={ttrRemaining}
              slaPercent={slaPercent}
              slaBarColor={slaBarColor}
              isClosed={isClosed}
            />

            {/* Scrollable Body */}
            <div className='flex-1 space-y-3 overflow-y-auto scroll-smooth p-5 pb-2'>

              <CompletionChecklist
                photoCount={photoCount}
                photoRequired={photoRequired}
                isOnProgress={isOnProgress}
              />

              <CustomerInfoSection
                ticket={ticket}
                ticketAge={ticketAge}
                addressSectionRef={addressSectionRef}
                canUpdateAlamat={canUpdateAlamat}
                isAlamatEmpty={isAlamatEmpty}
                isOnProgress={isOnProgress}
                onError={setError}
                onAddressSaved={(savedAddress) => {
                  setCurrentAlamat(savedAddress);
                  setError(null);
                }}
              />

              <DetailTicketSection
                ticket={ticket}
                isOnProgress={isOnProgress}
                isDeviceNameEmpty={isDeviceNameEmpty}
                canUpdateAlamat={canUpdateAlamat}
                isPending={isPending}
                onError={setError}
                onDeviceSaved={() => {
                  setError(null);
                  onUpdated();
                }}
              />

              {/* RCA Section */}
              {isOnProgress && (
                <SectionCard title='RCA' icon='🔍' iconBgColor='purple'>
                  <div className='space-y-4'>
                    {/* Label + Select RCA */}
                    <div>
                      <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400'>
                        Root Cause Analysis (RCA)
                      </label>
                      <select
                        value={selectedRca}
                        onChange={(e) => {
                          setSelectedRca(e.target.value);
                          setSelectedSubRca('');
                        }}
                        className='w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      >
                        <option value=''>-- Pilih RCA --</option>
                        {Object.keys(rcaMapping).map((rca) => (
                          <option key={rca} value={rca}>
                            {rca}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Label + Select Sub RCA — only show after RCA is chosen */}
                    {selectedRca && (
                      <div>
                        <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400'>
                          Sub RCA
                        </label>
                        <select
                          value={selectedSubRca}
                          onChange={(e) => setSelectedSubRca(e.target.value)}
                          className='w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        >
                          <option value=''>-- Pilih Sub RCA --</option>
                          {rcaMapping[selectedRca].map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Detail Perbaikan */}
                    <div>
                      <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400'>
                        Detail Perbaikan
                        <span className='ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                          WAJIB
                        </span>
                      </label>
                      <textarea
                        value={detailPerbaikan}
                        onChange={(e) => setDetailPerbaikan(e.target.value)}
                        placeholder='Jelaskan detail perbaikan yang sudah dilakukan...'
                        rows={4}
                        maxLength={500}
                        className='w-full resize-none appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      />
                      <div className='mt-1 flex justify-between'>
                        <span className='text-[10px] text-slate-400 dark:text-slate-500'>
                          Minimal 10 karakter
                        </span>
                        <span
                          className={`text-[12px] ${detailPerbaikan.length > 450 ? 'text-orange-500' : 'text-slate-400 dark:text-slate-500'}`}
                        >
                          {detailPerbaikan.length}/500
                        </span>
                      </div>
                    </div>

                    {/* Preview card when both RCA + Sub RCA are selected */}
                    {selectedRca && selectedSubRca && (
                      <div className='rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 dark:border-purple-500/20 dark:bg-purple-500/10'>
                        <p className='mb-0.5 text-[10px] font-bold tracking-wide text-purple-400 uppercase'>
                          RCA dipilih
                        </p>
                        <p className='text-sm font-bold text-purple-900 dark:text-purple-300'>
                          {selectedRca} → {selectedSubRca}
                        </p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              <ClosingResults ticket={ticket} isClosed={isClosed} />

              {/* Evidence Upload */}
              {isOnProgress && (
                <div ref={evidenceUploaderRef} id='evidence-uploader'>
                  <EvidenceUploader
                    onFilesChange={handleFileChange}
                    onPreviewFilesChange={handlePreviewFilesChange}
                    onRemoveImage={handleRemoveImage}
                    previewUrls={previewUrls}
                    uploading={uploading}
                    uploadProgress={uploadProgress}
                    onWarning={handleUploadWarning}
                    minFiles={2}
                    maxFiles={5}
                    instructions={[
                      'Foto Penyebab (Putusnya, ONT rusaknya, dll)',
                      'Foto Perbaikan (Ganti ONT, Tarik Ulang, Penyambungan, dll)',
                      'Capture SCC (halaman SCC layak)',
                      'Foto dengan pelanggan',
                      'Foto lokasi pelanggan',
                    ]}
                  />
                </div>
              )}

              {/* Evidence Gallery — tampil untuk status PENDING dan CLOSED */}
              {(isClosed || isPending) && (
                <EvidenceGallery
                  evidence={evidence}
                  loading={evidenceLoading}
                  error={evidenceError}
                  onImageClick={(idx) => {
                    setViewerIndex(idx);
                    setViewerOpen(true);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalFooter
          isOnProgress={isOnProgress}
          isAssigned={isAssigned}
          isPending={isPending}
          isClosed={isClosed}
          actionLoading={actionLoading}
          isRcaIncomplete={isRcaIncomplete}
          isEvidenceIncomplete={isEvidenceIncomplete}
          isAlamatEmpty={isAlamatEmpty}
          isDeviceNameEmpty={isDeviceNameEmpty}
          isDetailPerbaikanEmpty={isDetailPerbaikanEmpty}
          photoCount={photoCount}
          photoRequired={photoRequired}
          onUpdateClick={onUpdateClick}
          onPickup={handlePickup}
          onResume={handleResume}
          onClose={handleCloseTicket}
          onAddMember={() => setShowAddMember(true)}
        />
      </div>

      <AddMemberModal
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        ticketId={ticket.idTicket}
        incident={ticket.ticket}
      />

      <EvidenceSliderModal
        images={evidence.map((e) => ({
          src: e.driveUrl ?? e.url,
          alt: e.fileName,
        }))}
        isOpen={viewerOpen}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
