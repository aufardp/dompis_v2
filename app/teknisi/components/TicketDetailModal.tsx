'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { addHours } from 'date-fns';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  MapPin,
  Search,
  Smartphone,
  User,
} from 'lucide-react';
import { Ticket } from '@/app/types/ticket';
import { rcaMapping } from '@/app/types/rca';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import {
  calculateTicketAge,
  formatDateTimeWIB,
  getSlaHours,
  parseWIBDateInput,
} from '@/app/utils/datetime';
import { getMaxTtrInfo } from './TeknisiDashboard/utils/ttr';
import SectionCard from './detail-modal/SectionCard';
import ModalHeader from './detail-modal/ModalHeader';
import ModalFooter from './detail-modal/ModalFooter';
import AddMemberModal from './AddMemberModal';
import EvidenceUploader from './detail-modal/EvidenceUploader';
import EvidenceGallery from './detail-modal/EvidenceGallery';
import EvidenceSliderModal from './EvidenceSliderModal';
import AddressEditor, {
  AddressEditorHandle,
} from './detail-modal/AddressEditor';
import DeviceEditor from './detail-modal/DeviceEditor';
import LocationTagger, {
  LocationTagState,
  LocationTaggerHandle,
} from './detail-modal/LocationTagger';
import InfoField from './detail-modal/InfoField';
import LocationSummary from './detail-modal/LocationSummary';
import TicketHistoryTimeline from './detail-modal/TicketHistoryTimeline';
import { filesToDataUrls } from './detail-modal/file-preview';
import { useRcaSuggestions } from '@/app/hooks/useRcaSuggestions';
import RcaSuggestionChips from './detail-modal/RcaSuggestionChips';

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdated: (type?: 'close' | 'pickup' | 'resume') => void;
  onUpdateClick: () => void;
}

function formatCustomerType(customerType?: string) {
  switch (customerType) {
    case 'HVC_GOLD':
      return 'HVC Gold';
    case 'HVC_PLATINUM':
      return 'HVC Platinum';
    case 'HVC_DIAMOND':
      return 'HVC Diamond';
    case 'REGULER':
      return 'Reguler';
    default:
      return customerType || '-';
  }
}

export default function TicketDetailModal({
  ticket,
  onClose,
  onUpdated,
  onUpdateClick,
}: Props) {
  const [activeTab, setActiveTab] = useState<'detail' | 'evidence' | 'riwayat'>(
    'detail',
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [headerWarning, setHeaderWarning] = useState<string | null>(null);

  const [currentAlamat, setCurrentAlamat] = useState<string>(
    ticket.alamat?.trim() ?? '',
  );
  const [detailSnapshot, setDetailSnapshot] = useState<{
    reportedBy?: string | null;
    tracking?: Ticket['tracking'];
    activityLog?: Ticket['activityLog'];
    assignmentHistory?: Ticket['assignmentHistory'];
  } | null>(null);

  useEffect(() => {
    setCurrentAlamat(ticket.alamat?.trim() ?? '');
    setDetailSnapshot(null);
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

  const [evidencePending, setEvidencePending] = useState<
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
  const [evidencePendingLoading, setEvidencePendingLoading] = useState(false);
  const [evidencePendingError, setEvidencePendingError] = useState<
    string | null
  >(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [selectedRca, setSelectedRca] = useState('');
  const [selectedSubRca, setSelectedSubRca] = useState('');
  const [detailPerbaikan, setDetailPerbaikan] = useState('');
  const [rcaFocusRequested, setRcaFocusRequested] = useState(false);
  const { state: rcaSuggestionState } = useRcaSuggestions(
    ticket.deviceName,
    ticket.symptom,
    rcaFocusRequested,
  );

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const addressSectionRef = useRef<HTMLDivElement>(null);
  const evidenceUploaderRef = useRef<HTMLDivElement>(null);
  const addressEditorRef = useRef<AddressEditorHandle>(null);
  const locationTaggerRef = useRef<LocationTaggerHandle>(null);
  const [locationTag, setLocationTag] = useState<LocationTagState | null>(null);
  const [addressSuggestion, setAddressSuggestion] = useState<string | null>(
    null,
  );
  const [combinedSaving, setCombinedSaving] = useState(false);

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
  const CLOSE_PHOTO_MIN = 2;
  const isEvidenceIncomplete = selectedFiles.length < CLOSE_PHOTO_MIN;
  const photoRequired = CLOSE_PHOTO_MIN;

  const photoCount = isClosed
    ? evidenceLoading
      ? photoRequired
      : evidence.length
    : selectedFiles.length;

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

  const geotagRequired = process.env.NEXT_PUBLIC_GEOTAG_REQUIRED_ENABLED === 'true';

  const isLocationEmpty = useMemo(() => {
    if (!locationTag) return true;
    if (!Number.isFinite(locationTag.latitude)) return true;
    if (!Number.isFinite(locationTag.longitude)) return true;
    return locationTag.barcodeDc.trim().length === 0;
  }, [locationTag]);

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

  const canUpdateAlamat = (isOnProgress || isPending) && !isClosed;

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

  const ticketAge = useMemo(
    () =>
      calculateTicketAge(
        ticket.reportedDate,
        ticket.hasilVisit,
        ticket.closedAt,
      ),
    [ticket.reportedDate, ticket.hasilVisit, ticket.closedAt],
  );

  // Always fetch pending evidence (historical record)
  useEffect(() => {
    if (!ticket.idTicket) return;

    let cancelled = false;

    (async () => {
      setEvidencePendingLoading(true);
      setEvidencePendingError(null);

      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/evidence?scope=pending`,
        );
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (data?.success) {
          setEvidencePending(Array.isArray(data.data) ? data.data : []);
        } else {
          setEvidencePending([]);
          setEvidencePendingError(
            data?.message || 'Gagal mengambil evidence pending',
          );
        }
      } catch {
        if (cancelled) return;
        setEvidencePending([]);
        setEvidencePendingError('Gagal mengambil evidence pending');
      } finally {
        if (cancelled) return;
        setEvidencePendingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticket.idTicket]);

  // Fetch close evidence only when ticket is closed
  useEffect(() => {
    if (!isClosed) return;

    let cancelled = false;

    (async () => {
      setEvidenceLoading(true);
      setEvidenceError(null);

      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/evidence?scope=close`,
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

  useEffect(() => {
    if (!ticket.idTicket) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/detail`,
        );
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.success || !data?.data) return;

        setDetailSnapshot({
          reportedBy: data.data.reportedBy ?? null,
          tracking: data.data.tracking ?? null,
          activityLog: Array.isArray(data.data.activityLog)
            ? data.data.activityLog
            : [],
          assignmentHistory: Array.isArray(data.data.assignmentHistory)
            ? data.data.assignmentHistory
            : [],
        });
      } catch {
        if (!cancelled) {
          setDetailSnapshot(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticket.idTicket]);

  const detailTicket = useMemo(
    () => ({
      ...ticket,
      ...detailSnapshot,
    }),
    [ticket, detailSnapshot],
  );

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

  const handleFileChange = useCallback((files: File[]) => {
    const MAX_AFTER = 4 * 1024 * 1024;
    const stillTooLarge = files.filter((f) => f.size > MAX_AFTER);
    if (stillTooLarge.length > 0) {
      setError(
        `${stillTooLarge.length} foto masih terlalu besar setelah kompresi (maks 4MB per foto). ` +
          `Coba foto dengan pencahayaan lebih baik atau resolusi kamera lebih rendah.`,
      );
      return;
    }

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

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUploadWarning = useCallback((warning: string | null) => {
    setHeaderWarning(warning);
  }, []);

  const uploadEvidence = useCallback(async () => {
    if (!selectedFiles.length) return;

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

  const handleCloseTicket = useCallback(async () => {
    if (isAlamatEmpty) {
      setError('Alamat pelanggan wajib diisi sebelum menutup tiket.');
      setActiveTab('detail');
      requestAnimationFrame(() => {
        addressSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }

    if (isDeviceNameEmpty) {
      setError('Device Name wajib diisi sebelum menutup tiket.');
      return;
    }

    if (geotagRequired && isLocationEmpty) {
      setError('Lokasi (titik koordinat + barcode DC) wajib ditandai sebelum menutup tiket.');
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
      await uploadEvidence();

      const res = await fetchWithAuth('/api/tickets/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          rca: selectedRca,
          subRca: selectedSubRca,
          descriptionSolutionDompis: detailPerbaikan.trim(),
          latitude: locationTag?.latitude ?? undefined,
          longitude: locationTag?.longitude ?? undefined,
          accuracyMeters: locationTag?.accuracyMeters ?? undefined,
          barcodeDc: locationTag?.barcodeDc ?? undefined,
          locationSource: locationTag?.locationSource ?? undefined,
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
      setError(err.message || 'Terjadi kesalahan saat upload/close');
    } finally {
      setUploading(false);
      setActionLoading(null);
    }
  }, [
    isAlamatEmpty,
    isDeviceNameEmpty,
    geotagRequired,
    isLocationEmpty,
    isRcaIncomplete,
    isDetailPerbaikanEmpty,
    selectedFiles.length,
    uploadEvidence,
    ticket.idTicket,
    selectedRca,
    selectedSubRca,
    detailPerbaikan,
    locationTag?.latitude,
    locationTag?.longitude,
    locationTag?.accuracyMeters,
    locationTag?.barcodeDc,
    locationTag?.locationSource,
    onUpdated,
  ]);

  const handlePhotoClick = useCallback(() => {
    setActiveTab('evidence');
    requestAnimationFrame(() => {
      const evidenceSection = document.getElementById('evidence-uploader');
      if (evidenceSection) {
        evidenceSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  const handleScrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleScrollToAlamat = useCallback(
    () => handleScrollToSection('address-editor-section'),
    [handleScrollToSection],
  );
  const handleScrollToDevice = useCallback(
    () => handleScrollToSection('device-editor-section'),
    [handleScrollToSection],
  );
  const handleScrollToLocation = useCallback(
    () => handleScrollToSection('location-tagger-section'),
    [handleScrollToSection],
  );
  const handleScrollToRca = useCallback(
    () => handleScrollToSection('rca-section'),
    [handleScrollToSection],
  );
  const handleScrollToDetail = useCallback(
    () => handleScrollToSection('detail-perbaikan-section'),
    [handleScrollToSection],
  );

  const handleCombinedSave = useCallback(async () => {
    setError(null);
    if (!canUpdateAlamat) return;

    if (isAlamatEmpty) {
      setError('Alamat pelanggan wajib diisi sebelum menutup tiket.');
      handleScrollToAlamat();
      return;
    }

    setCombinedSaving(true);
    try {
      const addressOk = await addressEditorRef.current?.save();
      const locationOk = locationTaggerRef.current?.finalize();

      if (addressOk && locationOk) {
        setError(null);
        handleScrollToAlamat();
      } else if (addressOk === false) {
        handleScrollToAlamat();
      } else {
        handleScrollToLocation();
      }
    } finally {
      setCombinedSaving(false);
    }
  }, [
    canUpdateAlamat,
    isAlamatEmpty,
    handleScrollToAlamat,
    handleScrollToLocation,
  ]);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm'
      onClick={onClose}
    >
      <div
        className='flex w-full flex-col rounded-t-4xl bg-(--bg) shadow-2xl transition-all'
        style={{ height: 'calc(100dvh - 3.5rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-(--border-secondary)' />

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

        <div className='flex shrink-0 border-b border-(--border) bg-(--surface)'>
          {[
            { key: 'detail' as const, label: 'Detail' },
            {
              key: 'evidence' as const,
              label: 'Evidence',
              count: isClosed
                ? evidence.length + evidencePending.length
                : isPending
                  ? evidencePending.length
                  : isOnProgress
                    ? selectedFiles.length + evidencePending.length
                    : evidencePending.length,
            },
            { key: 'riwayat' as const, label: 'Riwayat' },
          ].map((tab) => (
            <button
              key={tab.key}
              type='button'
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex-1 border-b-2 py-2.5 text-xs font-bold transition-colors',
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-(--text-tertiary)',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className='ml-1 text-[10px] opacity-70'>
                  ({tab.count})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className='flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4'>
          {activeTab === 'detail' && (
            <div className='space-y-4'>
              {!isClosed && ttrRemaining && (
                <div
                  className={clsx(
                    'rounded-2xl border p-4',
                    ttrRemaining.isOverdue
                      ? 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10'
                      : 'border-(--border) bg-(--surface)',
                  )}
                >
                  <div className='flex items-end justify-between'>
                    <div>
                      <p className='text-[10px] font-semibold tracking-widest text-(--text-tertiary) uppercase'>
                        {ttrRemaining.isOverdue ? 'Terlewat' : 'Sisa Waktu'}
                      </p>
                      <p
                        className={clsx(
                          'text-2xl font-semibold tabular-nums',
                          ttrRemaining.isOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-(--text-primary)',
                        )}
                      >
                        {ttrRemaining.label}
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='text-[10px] font-semibold tracking-widest text-(--text-tertiary) uppercase'>
                        Max TTR
                      </p>
                      <p className='text-xs font-bold text-(--text-secondary)'>
                        {getMaxTtrInfo(ticket)}
                      </p>
                    </div>
                  </div>
                  <div className='mt-3 h-2 w-full overflow-hidden rounded-full bg-(--surface-3)'>
                    <div
                      className={clsx(
                        'h-full transition-all duration-500',
                        slaBarColor,
                      )}
                      style={{ width: `${slaPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <SectionCard
                title='Informasi Pelanggan'
                icon={User}
                iconBgColor='blue'
              >
                <div className='space-y-3'>
                  <InfoField
                    className='uppercase'
                    label='Nama'
                    value={ticket.contactName}
                  />
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

                  <div
                    ref={addressSectionRef}
                    id='address-editor-section'
                    className='border-t border-(--border) pt-2'
                  >
                    <p className='mb-2 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                      Alamat (Pastikan Valid)
                      {isOnProgress && isAlamatEmpty && (
                        <span className='ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                          <AlertTriangle size={10} className='mr-1 inline' />
                          WAJIB
                        </span>
                      )}
                    </p>
                    <AddressEditor
                      ticketId={ticket.idTicket}
                      serviceNo={ticket.serviceNo}
                      initialAddress={ticket.alamat}
                      suggestion={addressSuggestion}
                      canEdit={canUpdateAlamat}
                      hideOwnSave={canUpdateAlamat}
                      ref={addressEditorRef}
                      onError={setError}
                      onAddressSaved={(savedAddress) => {
                        setCurrentAlamat(savedAddress);
                        setError(null);
                      }}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title='Detail Ticket'
                icon={ClipboardList}
                iconBgColor='slate'
              >
                <div className='space-y-3'>
                  <InfoField
                    label='Jenis Pelanggan'
                    value={formatCustomerType(ticket.customerType)}
                  />
                  <InfoField label='Jenis Layanan' value={ticket.serviceType} />

                  <div
                    className='border-t border-(--border) pt-2'
                    id='device-editor-section'
                  >
                    <p className='mb-2 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                      Device Name (Pastikan Valid)
                      {isOnProgress && isDeviceNameEmpty && (
                        <span className='ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                          <AlertTriangle size={10} className='mr-1 inline' />
                          WAJIB
                        </span>
                      )}
                    </p>
                    <DeviceEditor
                      ticketId={ticket.idTicket}
                      initialDevice={ticket.deviceName}
                      canEdit={canUpdateAlamat}
                      onError={setError}
                      onDeviceSaved={() => {
                        setError(null);
                        onUpdated();
                      }}
                    />
                  </div>

                  <div
                    className='border-t border-(--border) pt-2'
                    id='location-tagger-section'
                  >
                    <p className='mb-2 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                      Lokasi Penanganan
                      {isOnProgress && geotagRequired && isLocationEmpty && (
                        <span className='ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                          <AlertTriangle size={10} className='mr-1 inline' />
                          WAJIB
                        </span>
                      )}
                    </p>
                    {ticket.serviceLocation && !canUpdateAlamat ? (
                      <LocationSummary location={ticket.serviceLocation} />
                    ) : (
                      <LocationTagger
                        ticketId={ticket.idTicket}
                        serviceNo={ticket.serviceNo}
                        contactName={ticket.contactName}
                        alamat={ticket.alamat}
                        deviceName={ticket.deviceName}
                        canEdit={canUpdateAlamat}
                        hideOwnSave={canUpdateAlamat}
                        ref={locationTaggerRef}
                        onError={setError}
                        onLocationChange={setLocationTag}
                        onAddressSuggestion={setAddressSuggestion}
                      />
                    )}
                  </div>

                  <InfoField label='Workzone' value={ticket.workzone} />

                  {ticket.symptom && (
                    <InfoField
                      label='Gejala / Symptom'
                      value={ticket.symptom}
                    />
                  )}

                  {isPending && ticket.pendingDompis && (
                    <div className='rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 dark:border-purple-500/20 dark:bg-purple-500/10'>
                      <p className='mb-1 text-[10px] font-bold tracking-wide text-purple-400 uppercase'>
                        Alasan Pending
                      </p>
                      <p className='text-sm font-semibold text-purple-900 dark:text-purple-300'>
                        {ticket.pendingDompis}
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>

              <div id='rca-section'>
                {isOnProgress ? (
                  <SectionCard title='RCA' icon={Search} iconBgColor='purple'>
                    <div className='space-y-4'>
                      <div>
                        <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                          Root Cause Analysis (RCA)
                        </label>
                        <select
                          value={selectedRca}
                          onFocus={() => {
                            if (!rcaFocusRequested) setRcaFocusRequested(true);
                          }}
                          onChange={(e) => {
                            setSelectedRca(e.target.value);
                            setSelectedSubRca('');
                          }}
                          className='w-full appearance-none rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-semibold text-(--text-primary) shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none'
                        >
                          <option value=''>-- Pilih RCA --</option>
                          {Object.keys(rcaMapping).map((rca) => (
                            <option key={rca} value={rca}>
                              {rca}
                            </option>
                          ))}
                        </select>
                        <RcaSuggestionChips
                          state={rcaSuggestionState}
                          onPick={(rca, subRca, description) => {
                            setSelectedRca(rca);
                            setSelectedSubRca(subRca);
                            if (description) setDetailPerbaikan(description);
                            setRcaFocusRequested(false);
                          }}
                        />
                      </div>

                      {selectedRca && (
                        <div>
                          <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                            Sub RCA
                          </label>
                          <select
                            value={selectedSubRca}
                            onChange={(e) => setSelectedSubRca(e.target.value)}
                            className='w-full appearance-none rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-semibold text-(--text-primary) shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none'
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

                      <div id='detail-perbaikan-section'>
                        <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                          Detail Perbaikan
                          <span className='ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                            WAJIB
                          </span>
                        </label>
                        <textarea
                          value={detailPerbaikan}
                          onChange={(e) => setDetailPerbaikan(e.target.value)}
                          placeholder='Jelaskan detail perbaikan yang sudah dilakukan...'
                          rows={4}
                          maxLength={500}
                          className='w-full resize-none appearance-none rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-medium text-(--text-primary) shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none'
                        />
                        <div className='mt-1 flex justify-between'>
                          <span className='text-[10px] text-(--text-tertiary)'>
                            Minimal 10 karakter
                          </span>
                          <span
                            className={`text-[12px] ${detailPerbaikan.length > 450 ? 'text-orange-500' : 'text-(--text-tertiary)'}`}
                          >
                            {detailPerbaikan.length}/500
                          </span>
                        </div>
                      </div>

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
                ) : isClosed ? (
                  <SectionCard
                    title='Closing Results'
                    icon={CheckCircle2}
                    iconBgColor='green'
                  >
                    <div className='space-y-3'>
                      <InfoField label='RCA' value={ticket.rca} />
                      <InfoField label='Sub RCA' value={ticket.subRca} />

                      {ticket.descriptionSolutionDompis && (
                        <div
                          className='border-t border-(--border) pt-3'
                          id='detail-perbaikan-section'
                        >
                          <p className='mb-1.5 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                            Detail Perbaikan
                          </p>
                          <div className='rounded-xl border border-green-100 bg-green-50/60 px-3.5 py-3 dark:border-green-500/20 dark:bg-green-500/10'>
                            <p className='text-sm leading-relaxed font-medium whitespace-pre-wrap text-(--text-primary)'>
                              {ticket.descriptionSolutionDompis}
                            </p>
                          </div>
                        </div>
                      )}
                      {ticket.serviceLocation && (
                        <div className='border-t border-(--border) pt-3'>
                          <p className='mb-1.5 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                            Lokasi Penanganan
                          </p>
                          <LocationSummary location={ticket.serviceLocation} />
                        </div>
                      )}
                    </div>
                  </SectionCard>
                ) : null}
              </div>

              {isOnProgress && canUpdateAlamat && (
                <button
                  type='button'
                  onClick={() => void handleCombinedSave()}
                  disabled={combinedSaving}
                  className='flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 font-sans text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'
                >
                  {combinedSaving ? (
                    <>
                      <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
                      Menyimpan lokasi & alamat...
                    </>
                  ) : (
                    <>
                      <MapPin size={17} />
                      Selesai Tag Lokasi & Alamat
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className='space-y-3'>
              {/* Pending evidence — always shown if exists */}
              {(evidencePending.length > 0 || evidencePendingLoading) && (
                <EvidenceGallery
                  evidence={evidencePending}
                  loading={evidencePendingLoading}
                  error={evidencePendingError}
                  title='Evidence Pending'
                  onImageClick={(idx) => {
                    setViewerIndex(idx);
                    setViewerOpen(true);
                  }}
                />
              )}

              {isOnProgress ? (
                <div id='evidence-uploader' ref={evidenceUploaderRef}>
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
              ) : isClosed ? (
                <EvidenceGallery
                  evidence={evidence}
                  loading={evidenceLoading}
                  error={evidenceError}
                  title='Evidence Close'
                  onImageClick={(idx) => {
                    setViewerIndex(evidencePending.length + idx);
                    setViewerOpen(true);
                  }}
                />
              ) : isPending &&
                evidencePending.length === 0 &&
                !evidencePendingLoading ? (
                <div className='rounded-2xl border border-dashed border-(--border) bg-(--surface) px-4 py-6 text-center'>
                  <p className='text-sm font-bold text-(--text-primary)'>
                    Belum ada evidence
                  </p>
                  <p className='mt-1 text-xs text-(--text-tertiary)'>
                    Evidence akan muncul setelah teknisi mengupdate tiket.
                  </p>
                </div>
              ) : isAssigned &&
                evidencePending.length === 0 &&
                !evidencePendingLoading ? (
                <div className='rounded-2xl border border-dashed border-(--border) bg-(--surface) px-4 py-6 text-center'>
                  <p className='text-sm font-bold text-(--text-primary)'>
                    Evidence belum tersedia
                  </p>
                  <p className='mt-1 text-xs text-(--text-tertiary)'>
                    Tunggu tiket dipickup untuk mulai upload evidence.
                  </p>
                </div>
              ) : !isOnProgress &&
                !isClosed &&
                !isPending &&
                !isAssigned &&
                evidencePending.length === 0 &&
                !evidencePendingLoading ? (
                <div className='rounded-2xl border border-dashed border-(--border) bg-(--surface) px-4 py-6 text-center'>
                  <p className='text-sm font-bold text-(--text-primary)'>
                    Evidence belum aktif
                  </p>
                  <p className='mt-1 text-xs text-(--text-tertiary)'>
                    Evidence akan muncul setelah tiket masuk proses.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'riwayat' && (
            <TicketHistoryTimeline ticket={detailTicket} status={status} />
          )}
        </div>

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
          isLocationEmpty={isLocationEmpty}
          geotagRequired={geotagRequired}
          isDetailPerbaikanEmpty={isDetailPerbaikanEmpty}
          photoCount={photoCount}
          photoRequired={photoRequired}
          onUpdateClick={onUpdateClick}
          onPickup={handlePickup}
          onResume={handleResume}
          onClose={handleCloseTicket}
          onAddMember={() => setShowAddMember(true)}
          onScrollToAlamat={handleScrollToAlamat}
          onScrollToDevice={handleScrollToDevice}
          onScrollToLocation={handleScrollToLocation}
          onScrollToRca={handleScrollToRca}
          onScrollToDetail={handleScrollToDetail}
          onScrollToFoto={handlePhotoClick}
        />
      </div>

      <AddMemberModal
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        ticketId={ticket.idTicket}
        incident={ticket.ticket}
      />

      <EvidenceSliderModal
        images={[...evidencePending, ...evidence].map((e) => ({
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
