'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Ticket } from '@/app/types/ticket';
import { rcaMapping } from '@/app/types/rca';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import EvidenceSliderModal from './EvidenceSliderModal';
import {
  formatDateTimeWIB,
  getSlaHours,
  parseWIBDateInput,
  calculateTicketAge,
} from '@/app/utils/datetime';
import { addHours } from 'date-fns';

import ModalHeader from './detail-modal/ModalHeader';
import ModalFooter from './detail-modal/ModalFooter';
import SectionCard from './detail-modal/SectionCard';
import InfoField, { formatPhone } from './detail-modal/InfoField';
import EvidenceUploader from './detail-modal/EvidenceUploader';
import EvidenceGallery from './detail-modal/EvidenceGallery';
import AddressEditor from './detail-modal/AddressEditor';
import { getMaxTtrInfo } from './TeknisiDashboard/utils/ttr';

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

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Status derived values
  const status = useMemo(
    () => ticket.hasilVisit?.toUpperCase() || 'OPEN',
    [ticket.hasilVisit],
  );

  const isAssigned = status === 'ASSIGNED';
  const isOnProgress = status === 'ON_PROGRESS';
  const isPending = status === 'PENDING';
  const isClosed = isTicketClosed(ticket.STATUS_UPDATE);

  const isRcaIncomplete = !selectedRca || !selectedSubRca;
  const isEvidenceIncomplete = selectedFiles.length < 2;
  const photoCount = selectedFiles.length;
  const photoRequired = 2;

  // Address can be updated when ticket is ON_PROGRESS or PENDING, and not closed
  const canUpdateAlamat = (isOnProgress || isPending) && !isClosed;

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

  // Fetch evidence for closed tickets
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
      if (data.success) onUpdated();
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
      if (data.success) onUpdated();
      else setError(data.message || 'Gagal mengambil ticket');
    } catch {
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }, [ticket.idTicket, onUpdated]);

  // File handlers
  const handleFileChange = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setPreviewUrls(files.map((f) => URL.createObjectURL(f)));
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

  // Upload evidence
  const uploadEvidence = useCallback(async () => {
    if (!selectedFiles.length) return;

    return new Promise<void>((resolve, reject) => {
      const formData = new FormData();
      formData.append('incident', ticket.ticket);
      formData.append('ticketId', String(ticket.idTicket));
      formData.append('actionType', 'close');

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
  }, [selectedFiles, ticket.ticket, ticket.idTicket]);

  // Close ticket handler
  const handleCloseTicket = useCallback(async () => {
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
  }, [
    isRcaIncomplete,
    uploadEvidence,
    ticket.idTicket,
    selectedRca,
    selectedSubRca,
    onUpdated,
  ]);

  const handlePhotoClick = useCallback(() => {
    // Scroll to evidence uploader section
    const evidenceSection = document.getElementById('evidence-uploader');
    if (evidenceSection) {
      evidenceSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm'
      onClick={onClose}
    >
      {/* Bottom Sheet */}
      <div
        className='animate-slide-up flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className='mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-slate-200' />

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
          onClose={onClose}
        />

        {/* ISSUE 3: SLA Progress Bar */}
        <div className='shrink-0 border-b border-slate-100 px-5 py-3'>
          <div className='mb-1.5 flex justify-between'>
            <span className='text-[10px] font-semibold tracking-wide text-slate-400 uppercase'>
              Laporan:{' '}
              {ticket.reportedDate
                ? formatDateTimeWIB(ticket.reportedDate)
                : '-'}
            </span>
            <span className='text-[10px] font-semibold tracking-wide text-orange-500 uppercase'>
              Max TTR: {getMaxTtrInfo(ticket)} ⚠
            </span>
          </div>
          <div className='h-1.5 overflow-hidden rounded-full bg-slate-100'>
            <div
              className={`h-full rounded-full transition-all ${slaBarColor}`}
              style={{ width: `${slaPercent}%` }}
            />
          </div>
        </div>

        {/* Scrollable Body */}
        <div className='flex-1 space-y-3 overflow-y-auto scroll-smooth p-5 pb-2'>
          {/* Error Banner */}
          {error && (
            <div className='rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
              {error}
            </div>
          )}

          {/* ISSUE 4: MAX TTR Warning Box */}
          {ttrRemaining && (
            <div className='flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3'>
              <div>
                <p className='mb-0.5 text-[10px] font-bold tracking-wide text-orange-500 uppercase'>
                  ⚠ Batas Waktu (Max TTR)
                </p>
                <p className='text-sm font-bold text-orange-800'>
                  {getMaxTtrInfo(ticket)}
                </p>
              </div>
              <div className='text-right'>
                <p className='mb-0.5 text-[10px] font-semibold tracking-wide text-orange-400 uppercase'>
                  {ttrRemaining.isOverdue ? 'Terlewat' : 'Sisa Waktu'}
                </p>
                <p
                  className={`text-xl font-black tabular-nums ${ttrRemaining.isOverdue ? 'text-red-600' : 'text-orange-700'}`}
                >
                  {ttrRemaining.label}
                </p>
              </div>
            </div>
          )}

          {/* ISSUE 5: Completion Checklist */}
          <div className='flex gap-2'>
            {/* Photo status */}
            <div
              className={`flex flex-1 items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 ${
                photoCount >= photoRequired
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}
            >
              <span className='text-sm'>📷</span>
              <div>
                <p className='mb-0.5 text-[10px] leading-none font-bold tracking-wide uppercase'>
                  Foto
                </p>
                <p className='text-xs font-bold'>
                  {photoCount} / {photoRequired}
                </p>
              </div>
            </div>
          </div>

          {/* Customer Info Section */}
          <SectionCard title='Informasi Pelanggan' icon='👤' iconBgColor='blue'>
            <div className='space-y-3'>
              <InfoField label='Nama' value={ticket.contactName} />
              <InfoField
                label='Telepon'
                value={ticket.contactPhone}
                variant='phone'
              />
              <InfoField label='No. Service' value={ticket.serviceNo} />
              <InfoField
                label='Tgl. Laporan'
                value={
                  ticket.reportedDate
                    ? formatDateTimeWIB(ticket.reportedDate)
                    : '-'
                }
              />
              <InfoField label='Umur Ticket' value={ticketAge} />

              {/* Address - with new AddressEditor component */}
              <div className='border-t border-slate-100 pt-2'>
                <p className='mb-2 text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
                  Alamat
                </p>
                <AddressEditor
                  ticketId={ticket.idTicket}
                  initialAddress={ticket.alamat}
                  canEdit={canUpdateAlamat}
                  onError={(err) => setError(err)}
                />
              </div>
            </div>
          </SectionCard>

          {/* Detail Ticket Section */}
          <SectionCard title='Detail Ticket' icon='📋' iconBgColor='slate'>
            <div className='space-y-3'>
              <InfoField label='Jenis Layanan' value={ticket.serviceType} />
              <InfoField label='Jenis Pelanggan' value={ticket.customerType} />
              <InfoField label='Device' value={ticket.deviceName} />
              <InfoField label='Workzone' value={ticket.workzone} />
              <InfoField label='Symptom' value={ticket.symptom} />
            </div>
          </SectionCard>

          {/* RCA Section */}
          {isOnProgress && (
            <SectionCard title='RCA' icon='🔍' iconBgColor='purple'>
              <div className='space-y-3'>
                <select
                  value={selectedRca}
                  onChange={(e) => {
                    setSelectedRca(e.target.value);
                    setSelectedSubRca('');
                  }}
                  className='w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:outline-none'
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
                    className='w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:outline-none'
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
            </SectionCard>
          )}

          {/* Closed: RCA Result */}
          {isClosed && (
            <SectionCard title='Closing Results' icon='✅' iconBgColor='green'>
              <div className='space-y-3'>
                <InfoField label='RCA' value={ticket.rca} />
                <InfoField label='Sub RCA' value={ticket.subRca} />
              </div>
            </SectionCard>
          )}

          {/* Evidence Upload */}
          {isOnProgress && (
            <div id='evidence-uploader'>
              <EvidenceUploader
                onFilesChange={handleFileChange}
                onRemoveImage={handleRemoveImage}
                previewUrls={previewUrls}
                uploadProgress={uploadProgress}
                uploading={uploading}
              />
            </div>
          )}

          {/* Evidence Gallery */}
          {isClosed && (
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

        {/* Footer */}
        <ModalFooter
          isOnProgress={isOnProgress}
          isAssigned={isAssigned}
          isPending={isPending}
          isClosed={isClosed}
          actionLoading={actionLoading}
          isRcaIncomplete={isRcaIncomplete}
          isEvidenceIncomplete={isEvidenceIncomplete}
          photoCount={photoCount}
          photoRequired={photoRequired}
          onUpdateClick={onUpdateClick}
          onPickup={handlePickup}
          onResume={handleResume}
          onClose={handleCloseTicket}
          onPhotoClick={handlePhotoClick}
        />
      </div>

      <EvidenceSliderModal
        images={evidence.map((e) => ({ src: e.driveUrl ?? e.url, alt: e.fileName }))}
        isOpen={viewerOpen}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
