'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  PauseCircle,
  Phone,
  Search,
  Smartphone,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import { addHours } from 'date-fns';
import type { Ticket } from '@/app/types/ticket';
import {
  formatDateTimeWIB,
  getSlaHours,
  parseWIBDateInput,
} from '@/app/utils/datetime';
import { getMaxTtrInfo } from './TeknisiDashboard/utils/ttr';
import SectionCard from './detail-modal/SectionCard';
import InfoField from './detail-modal/InfoField';
import EvidenceGallery from './detail-modal/EvidenceGallery';
import EvidenceSliderModal from './EvidenceSliderModal';
import TicketHistoryTimeline from './detail-modal/TicketHistoryTimeline';
import AddressEditor from './detail-modal/AddressEditor';
import DeviceEditor from './detail-modal/DeviceEditor';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { rcaMapping } from '@/app/types/rca';
import clsx from 'clsx';

interface TicketDetailContentProps {
  ticket: Ticket;
  isClosed: boolean;
}

// ── Step mapping ──────────────────────────────────────────────
const STEPS = [
  { key: 'ASSIGNED', label: 'Assigned', icon: User },
  { key: 'ON_PROGRESS', label: 'Dikerjakan', icon: Wrench },
  { key: 'PENDING', label: 'Pending', icon: PauseCircle },
  { key: 'CLOSE', label: 'Selesai', icon: CheckCircle2 },
] as const;

function getActiveStep(status: string): number {
  switch (status) {
    case 'ASSIGNED':
      return 0;
    case 'ON_PROGRESS':
      return 1;
    case 'PENDING':
      return 2;
    case 'CLOSE':
    case 'CLOSED':
      return 3;
    default:
      return -1;
  }
}

// ── Status helpers ────────────────────────────────────────────
function normalizeStatus(
  status_update?: string | null,
  hasilVisit?: string | null,
): string {
  return (status_update ?? hasilVisit ?? '').toUpperCase().trim() || 'OPEN';
}

function isOnProgress(status: string): boolean {
  return status === 'ON_PROGRESS';
}

function isPending(status: string): boolean {
  return status === 'PENDING';
}

function isAssigned(status: string): boolean {
  return status === 'ASSIGNED';
}

// ── Evidence type ─────────────────────────────────────────────
interface EvidenceItem {
  id: number;
  fileName: string;
  filePath: string;
  url: string;
  driveUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string | null;
}

// ── Customer type formatter ───────────────────────────────────
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

// ── Phone formatter ───────────────────────────────────────────
function formatPhone(phone: string): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `+62 ${cleaned.slice(1)}`;
  if (cleaned.startsWith('62')) return `+${cleaned}`;
  return cleaned;
}

const EMPTY_VALUES = [
  'tidak ada',
  'tidak tersedia',
  '-',
  'n/a',
  'none',
  '.',
  'null',
  'undefined',
];

function isFilled(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v.length > 0 && !EMPTY_VALUES.includes(v);
}

// ── Component ─────────────────────────────────────────────────
export default function TicketDetailContent({
  ticket,
  isClosed: isTicketClosed,
}: TicketDetailContentProps) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const actualStatus = normalizeStatus(ticket.status_update, ticket.hasilVisit);
  const status = optimisticStatus ?? actualStatus;
  const activeStep = getActiveStep(status);
  const maxTtr = getMaxTtrInfo(ticket);

  // SLA overdue calculation
  const slaInfo = useMemo(() => {
    const reported = parseWIBDateInput(ticket.reportedDate);
    if (!reported) return null;
    const slaHours = getSlaHours(ticket.customerType);
    const deadline = addHours(reported, slaHours);
    const diff = deadline.getTime() - Date.now();
    const isOverdue = diff < 0;
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    return {
      isOverdue,
      label: `${isOverdue ? '-' : ''}${h}j ${m}m`,
      deadline: formatDateTimeWIB(deadline.toISOString()),
    };
  }, [ticket.reportedDate, ticket.customerType]);

  // Evidence state
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [evidencePending, setEvidencePending] = useState<EvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ── Fetch evidence ──────────────────────────────────────────
  useEffect(() => {
    if (!ticket.idTicket) return;
    let cancelled = false;

    (async () => {
      setEvidenceLoading(true);
      setEvidenceError(null);
      try {
        const [pendingRes, closeRes] = await Promise.all([
          fetchWithAuth(
            `/api/tickets/${ticket.idTicket}/evidence?scope=pending`,
          ),
          fetchWithAuth(`/api/tickets/${ticket.idTicket}/evidence?scope=close`),
        ]);

        if (cancelled) return;

        if (pendingRes) {
          const data = await pendingRes.json().catch(() => null);
          if (data?.success)
            setEvidencePending(Array.isArray(data.data) ? data.data : []);
        }

        if (closeRes) {
          const data = await closeRes.json().catch(() => null);
          if (data?.success) {
            setEvidence(Array.isArray(data.data) ? data.data : []);
            setCloseEvidenceCount(
              Array.isArray(data.data) ? data.data.length : 0,
            );
          }
        }
      } catch {
        if (cancelled) return;
        setEvidenceError('Gagal mengambil evidence');
      } finally {
        if (cancelled) return;
        setEvidenceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticket.idTicket]);

  const allEvidence = useMemo(
    () => [...evidencePending, ...evidence],
    [evidencePending, evidence],
  );

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Close form state
  const [selectedRca, setSelectedRca] = useState('');
  const [selectedSubRca, setSelectedSubRca] = useState('');
  const [detailPerbaikan, setDetailPerbaikan] = useState('');
  const [closeEvidenceCount, setCloseEvidenceCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'detail' | 'evidence' | 'riwayat'>(
    'detail',
  );

  const [currentAddress, setCurrentAddress] = useState(ticket.alamat || '');
  const [currentDevice, setCurrentDevice] = useState(ticket.deviceName || '');

  useEffect(() => {
    setCurrentAddress(ticket.alamat || '');
  }, [ticket.alamat]);

  useEffect(() => {
    setCurrentDevice(ticket.deviceName || '');
  }, [ticket.deviceName]);

  // Restore form state from sessionStorage (when navigating back from evidence page)
  useEffect(() => {
    const key = `ticket_form_${ticket.idTicket}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.selectedRca) setSelectedRca(parsed.selectedRca);
        if (parsed.selectedSubRca) setSelectedSubRca(parsed.selectedSubRca);
        if (parsed.detailPerbaikan) setDetailPerbaikan(parsed.detailPerbaikan);
      } catch {}
      sessionStorage.removeItem(key);
    }
  }, [ticket.idTicket]);

  const canClose = useMemo(() => {
    return (
      isFilled(currentAddress) &&
      isFilled(currentDevice) &&
      !!selectedRca &&
      !!selectedSubRca &&
      detailPerbaikan.trim().length >= 10 &&
      closeEvidenceCount >= 2
    );
  }, [
    currentAddress,
    currentDevice,
    selectedRca,
    selectedSubRca,
    detailPerbaikan,
    closeEvidenceCount,
  ]);

  const missingItems = useMemo(() => {
    const missing: string[] = [];
    if (!isFilled(currentAddress)) missing.push('Alamat');
    if (!isFilled(currentDevice)) missing.push('Device');
    if (!selectedRca || !selectedSubRca) missing.push('RCA');
    if (detailPerbaikan.trim().length < 10) missing.push('Detail Perbaikan');
    if (closeEvidenceCount < 2) missing.push('Evidence (min 2 foto)');
    return missing;
  }, [
    currentAddress,
    currentDevice,
    selectedRca,
    selectedSubRca,
    detailPerbaikan,
    closeEvidenceCount,
  ]);

  // ── Back ────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // ── Pickup ──────────────────────────────────────────────────
  const handlePickup = useCallback(async () => {
    setActionLoading('pickup');
    try {
      const res = await fetchWithAuth('/api/tickets/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) {
        router.push('/teknisi');
      }
    } finally {
      setActionLoading(null);
    }
  }, [ticket.idTicket, router]);

  // ── Resume (Pending → On Progress) ─────────────────────────
  const handleResume = useCallback(async () => {
    setActionLoading('resume');
    setError(null);
    setOptimisticStatus('ON_PROGRESS');
    try {
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket, resume: true }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        setOptimisticStatus(null);
        setError(data.message || 'Gagal resume ticket');
      }
    } catch {
      setOptimisticStatus(null);
      setError('Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }, [ticket.idTicket, router]);

  // ── Navigate to evidence page ──────────────────────────────
  const handleGoToEvidence = useCallback(() => {
    sessionStorage.setItem(
      `ticket_form_${ticket.idTicket}`,
      JSON.stringify({ selectedRca, selectedSubRca, detailPerbaikan }),
    );
    router.push(`/teknisi/ticket/${ticket.idTicket}/evidence`);
  }, [router, ticket.idTicket, selectedRca, selectedSubRca, detailPerbaikan]);

  // ── Navigate to evidence page (pending mode) ─────────────
  const handleGoToEvidencePending = useCallback(() => {
    sessionStorage.setItem(
      `ticket_form_${ticket.idTicket}`,
      JSON.stringify({ selectedRca, selectedSubRca, detailPerbaikan }),
    );
    router.push(`/teknisi/ticket/${ticket.idTicket}/evidence?mode=pending`);
  }, [router, ticket.idTicket, selectedRca, selectedSubRca, detailPerbaikan]);

  // ── Scroll to section ─────────────────────────────────────
  const handleScrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Close Ticket ───────────────────────────────────────────
  const handleCloseTicket = useCallback(async () => {
    if (!isFilled(currentAddress)) {
      setError('Alamat pelanggan wajib diisi sebelum close');
      return;
    }
    if (!isFilled(currentDevice)) {
      setError('Device Name (ODP) wajib diisi sebelum close');
      return;
    }
    if (!selectedRca || !selectedSubRca) {
      setError('RCA dan Sub RCA wajib diisi');
      return;
    }
    if (detailPerbaikan.trim().length < 10) {
      setError('Detail perbaikan wajib diisi minimal 10 karakter');
      return;
    }
    if (closeEvidenceCount < 2) {
      setError(
        'Minimal 2 foto evidence wajib diupload sebelum close. Upload di menu Evidence.',
      );
      return;
    }
    setError(null);
    setActionLoading('close');
    try {
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
      if (!res) throw new Error('Tidak ada respon');
      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem(`ticket_form_${ticket.idTicket}`);
        router.push('/teknisi');
      } else {
        throw new Error(data.message || 'Gagal menutup ticket');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }, [
    currentAddress,
    currentDevice,
    selectedRca,
    selectedSubRca,
    detailPerbaikan,
    closeEvidenceCount,
    ticket.idTicket,
    router,
  ]);

  return (
    <div className='flex h-dvh flex-col bg-(--bg)'>
      {/* ── Sticky Top Bar ─────────────────────────────────────── */}
      <div className='sticky top-0 z-20 flex items-center gap-3 border-b border-(--border) bg-(--surface) px-4 py-3'>
        <button
          type='button'
          onClick={handleBack}
          className='flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) bg-(--surface-2) text-(--text-secondary) transition-all active:scale-95'
        >
          <ArrowLeft size={18} />
        </button>
        <div className='min-w-0 flex-1'>
          <p className='font-mono text-base font-bold text-(--text-primary)'>
            {ticket.ticket}
          </p>
          <p className='truncate text-xs text-(--text-secondary)'>
            {ticket.summary}
          </p>
        </div>
      </div>

      {/* ── Progress Stepper ──────────────────────────────────── */}
      <div className='overflow-hidden border-b border-(--border) bg-(--surface) px-4 py-4'>
        <div className='flex items-start'>
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const isLastStep = activeStep >= STEPS.length - 1;
            const isCompleted = isLastStep || i < activeStep;
            const isActive = !isLastStep && i === activeStep;
            const isFuture = !isActive && !isCompleted;

            return (
              <div key={step.key} className='flex flex-1 flex-col items-center'>
                <div className='flex w-full items-center'>
                  <div
                    className={clsx(
                      'h-0.5 flex-1',
                      i === 0 && 'bg-transparent',
                      i > 0 && i <= activeStep && 'bg-green-500',
                      i > 0 && i > activeStep && 'bg-(--border)',
                    )}
                  />
                  <div
                    className={clsx(
                      'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                      isActive &&
                        'bg-primary ring-primary/20 text-white ring-4',
                      isCompleted && 'bg-green-500 text-white',
                      isFuture &&
                        'border border-(--border) bg-(--surface-2) text-(--text-muted)',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <StepIcon size={16} />
                    )}
                  </div>
                  <div
                    className={clsx(
                      'h-0.5 flex-1',
                      i >= STEPS.length - 1 && 'bg-transparent',
                      i < STEPS.length - 1 && i < activeStep && 'bg-green-500',
                      i < STEPS.length - 1 &&
                        i >= activeStep &&
                        'bg-(--border)',
                    )}
                  />
                </div>
                <span
                  className={clsx(
                    'mt-1.5 text-[10px] font-bold',
                    isActive && 'text-primary',
                    isCompleted && 'text-green-600 dark:text-green-400',
                    isFuture && 'text-(--text-muted)',
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SLA Alert Banner ──────────────────────────────────── */}
      {slaInfo?.isOverdue && (
        <div className='flex items-center gap-2 bg-red-500 px-4 py-2.5 text-sm font-bold text-white'>
          <AlertTriangle size={16} />
          Terlambat {slaInfo.label} — Batas: {slaInfo.deadline}
        </div>
      )}

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <div className='flex shrink-0 border-b border-(--border) bg-(--surface)'>
        {[
          { key: 'detail' as const, label: 'Detail' },
          {
            key: 'evidence' as const,
            label: 'Evidence',
            count: allEvidence.length,
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
            {tab.key === 'evidence' && tab.count > 0 && (
              <span className='ml-1 text-[10px] opacity-70'>({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Scrollable Content ────────────────────────────────── */}
      <div className='flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-4'>
        {activeTab === 'detail' && (
          <>
            {/* Customer Info */}
            <div id='address-editor-section'>
              <SectionCard
                title='Informasi Pelanggan'
                icon={User}
                iconBgColor='blue'
              >
                <div className='space-y-3'>
                  <InfoField
                    label='Nama'
                    value={ticket.contactName}
                    className='uppercase'
                  />
                  <div>
                    <p className='text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                      Telepon
                    </p>
                    <div className='mt-1 flex items-center gap-2'>
                      <p className='text-sm font-semibold text-(--text-primary)'>
                        {formatPhone(ticket.contactPhone)}
                      </p>
                      {ticket.contactPhone && (
                        <div className='flex gap-1'>
                          <a
                            href={`https://wa.me/${ticket.contactPhone.replace(/^0/, '62')}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='inline-flex items-center gap-1 rounded-lg bg-green-500 px-2.5 py-1 text-[10px] font-bold text-white transition-all active:scale-95'
                          >
                            <Phone size={12} /> WhatsApp
                          </a>
                          <a
                            href={`tel:${ticket.contactPhone}`}
                            className='bg-primary inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold text-white transition-all active:scale-95'
                          >
                            <Phone size={12} /> Telepon
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <AddressEditor
                    ticketId={ticket.idTicket}
                    initialAddress={ticket.alamat}
                    canEdit={isOnProgress(status) || isPending(status)}
                    onError={setError}
                    onAddressSaved={(addr) => setCurrentAddress(addr)}
                  />
                </div>
              </SectionCard>
            </div>

            {/* Technical Detail */}
            <div id='device-editor-section'>
              <SectionCard
                title='Detail Teknis'
                icon={Smartphone}
                iconBgColor='slate'
              >
                <div className='space-y-3'>
                  <InfoField label='No. Service' value={ticket.serviceNo} />
                  <InfoField
                    label='Tipe Layanan'
                    value={ticket.serviceType || 'Internet'}
                  />
                  <DeviceEditor
                    ticketId={ticket.idTicket}
                    initialDevice={ticket.deviceName}
                    canEdit={isOnProgress(status) || isPending(status)}
                    onError={setError}
                    onDeviceSaved={(device) => setCurrentDevice(device)}
                  />
                  {ticket.onuRx && (
                    <InfoField label='RX Optical' value={ticket.onuRx} />
                  )}
                  <InfoField label='Workzone' value={ticket.workzone || '-'} />
                  {ticket.symptom && (
                    <InfoField label='Gejala' value={ticket.symptom} />
                  )}
                  <InfoField label='Max TTR' value={maxTtr} />
                </div>
              </SectionCard>
            </div>

            {/* Pending reason (when pending) */}
            {isPending(status) && ticket.pendingDompis && (
              <SectionCard
                title='Alasan Pending'
                icon={PauseCircle}
                iconBgColor='purple'
              >
                <div className='rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 dark:border-purple-500/20 dark:bg-purple-500/10'>
                  <p className='text-sm font-bold text-purple-900 dark:text-purple-300'>
                    {ticket.pendingDompis}
                  </p>
                </div>
              </SectionCard>
            )}

            {/* RCA & Close form (when on progress) */}
            <div id='rca-section'>
              {isOnProgress(status) && (
                <SectionCard
                  title='RCA & Closing'
                  icon={Search}
                  iconBgColor='purple'
                >
                  <div className='space-y-4'>
                    <div>
                      <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                        Root Cause Analysis (RCA)
                      </label>
                      <select
                        value={selectedRca}
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
                          {rcaMapping[selectedRca]?.map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedRca && selectedSubRca && (
                      <div className='rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 dark:border-purple-500/20 dark:bg-purple-500/10'>
                        <p className='text-[10px] font-bold tracking-wide text-purple-400 uppercase'>
                          RCA dipilih
                        </p>
                        <p className='text-sm font-bold text-purple-900 dark:text-purple-300'>
                          {selectedRca} → {selectedSubRca}
                        </p>
                      </div>
                    )}
                    <div id='detail-perbaikan-section'>
                      <label className='mb-1.5 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                        Detail Perbaikan{' '}
                        <span className='text-red-500'>(wajib)</span>
                      </label>
                      <textarea
                        value={detailPerbaikan}
                        onChange={(e) => setDetailPerbaikan(e.target.value)}
                        placeholder='Jelaskan detail perbaikan yang sudah dilakukan...'
                        rows={4}
                        maxLength={500}
                        className='w-full resize-none rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-medium text-(--text-primary) shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none'
                      />
                      <div className='mt-1 flex justify-between'>
                        <span className='text-[10px] text-(--text-tertiary)'>
                          Minimal 10 karakter
                        </span>
                        <span className='text-[10px] text-(--text-tertiary)'>
                          {detailPerbaikan.length}/500
                        </span>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>

            {/* Evidence upload (when on progress) */}
            <div id='evidence-section'>
              {isOnProgress(status) && (
                <button
                  type='button'
                  onClick={handleGoToEvidence}
                  className='w-full rounded-2xl border border-(--border) bg-(--surface) p-4 text-left transition-all active:scale-[0.98]'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2.5'>
                      <div className='bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl'>
                        <Camera size={18} />
                      </div>
                      <div>
                        <p className='text-sm font-bold text-(--text-primary)'>
                          Upload Evidence
                        </p>
                        <p className='text-xs text-(--text-secondary)'>
                          {closeEvidenceCount}/5 foto diupload
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      {closeEvidenceCount >= 2 ? (
                        <span className='rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-500/15 dark:text-green-400'>
                          Lengkap
                        </span>
                      ) : (
                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-400'>
                          Wajib 2
                        </span>
                      )}
                      <span className='text-(--text-tertiary)'>
                        <svg
                          width='16'
                          height='16'
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                        >
                          <path d='M9 18l6-6-6-6' />
                        </svg>
                      </span>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Closing Results (only when closed) */}
            {isTicketClosed && ticket.rca && (
              <SectionCard
                title='Hasil Closing'
                icon={CheckCircle2}
                iconBgColor='green'
              >
                <div className='space-y-3'>
                  <InfoField label='RCA' value={ticket.rca} />
                  <InfoField label='Sub RCA' value={ticket.subRca} />
                  {ticket.descriptionSolutionDompis && (
                    <div className='rounded-xl border border-green-100 bg-green-50/60 px-3.5 py-3 dark:border-green-500/20 dark:bg-green-500/10'>
                      <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                        Detail Perbaikan
                      </p>
                      <p className='text-sm leading-relaxed font-medium whitespace-pre-wrap text-(--text-primary)'>
                        {ticket.descriptionSolutionDompis}
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
            <div className='h-48' />
          </>
        )}

        {activeTab === 'evidence' && (
          <div className='space-y-4'>
            {/* Evidence upload (when on progress) */}
            {/* Pending evidence */}
            {evidencePending.length > 0 && (
              <EvidenceGallery
                evidence={evidencePending}
                loading={false}
                title='Evidence Saat Pending'
                onImageClick={(idx) => {
                  setViewerIndex(idx);
                  setViewerOpen(true);
                }}
              />
            )}

            {/* Close evidence */}
            {evidence.length > 0 && (
              <EvidenceGallery
                evidence={evidence}
                loading={false}
                title='Evidence Saat Close'
                onImageClick={(idx) => {
                  setViewerIndex(evidencePending.length + idx);
                  setViewerOpen(true);
                }}
              />
            )}

            {evidencePending.length === 0 && evidence.length === 0 && (
              <div className='flex flex-col items-center justify-center rounded-2xl border border-(--border) bg-(--surface) px-4 py-12'>
                <Camera size={32} className='mb-3 text-(--text-muted)' />
                <p className='text-sm font-bold text-(--text-tertiary)'>
                  Belum ada evidence
                </p>
                <p className='mt-0.5 text-xs text-(--text-muted)'>
                  Evidence akan muncul di sini setelah diupload
                </p>
              </div>
            )}
            <div className='h-48' />
          </div>
        )}

        {activeTab === 'riwayat' && (
          <>
            <TicketHistoryTimeline ticket={ticket} status={status} />
            <div className='h-48' />
          </>
        )}
      </div>

      {/* ── Image Viewer Lightbox ────────────────────────────────── */}
      {viewerOpen && (
        <EvidenceSliderModal
          images={allEvidence.map((e) => ({
            src: e.url,
            alt: e.fileName,
          }))}
          isOpen={viewerOpen}
          startIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* ── Error Banner ────────────────────────────────────────── */}
      {error && (
        <div className='fixed right-0 bottom-20 left-0 z-30 mx-auto flex w-full max-w-2xl items-center gap-2 bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg'>
          <AlertTriangle size={16} />
          <span className='flex-1'>{error}</span>
          <button
            type='button'
            onClick={() => setError(null)}
            className='shrink-0 rounded-lg bg-white/20 px-2 py-0.5 text-xs transition-all active:scale-95'
          >
            Tutup
          </button>
        </div>
      )}

      {/* ── Fixed Footer ──────────────────────────────────────── */}
      <div className='fixed right-0 bottom-0 left-0 z-20 border-t border-(--border) bg-(--surface) px-4 pt-2 pb-3'>
        <div className='mx-auto flex max-w-2xl flex-col gap-2'>
          {isOnProgress(status) && (
            <div className='flex items-center justify-center gap-2 border-b border-(--border) px-4 pb-2'>
              {[
                {
                  id: 'Alamat',
                  done: isFilled(currentAddress),
                  action: () => handleScrollToSection('address-editor-section'),
                },
                {
                  id: 'Device',
                  done: isFilled(currentDevice),
                  action: () => handleScrollToSection('device-editor-section'),
                },
                {
                  id: 'RCA',
                  done: !!selectedRca && !!selectedSubRca,
                  action: () => handleScrollToSection('rca-section'),
                },
                {
                  id: 'Detail',
                  done: detailPerbaikan.trim().length >= 10,
                  action: () =>
                    handleScrollToSection('detail-perbaikan-section'),
                },
                {
                  id: 'Evidence',
                  done: closeEvidenceCount >= 2,
                  action: handleGoToEvidence,
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type='button'
                  onClick={item.action}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-90',
                    item.done
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                      : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {item.id}
                </button>
              ))}
            </div>
          )}
          <div className='flex items-center justify-between gap-2'>
            {isTicketClosed ? (
              <div className='flex w-full items-center justify-center gap-2 rounded-2xl bg-green-500 py-3 text-sm font-bold text-white'>
                <CheckCircle2 size={18} />
                Ticket Closed
              </div>
            ) : isOnProgress(status) ? (
              <div className='flex w-full flex-col gap-1.5'>
                <div className='flex w-full gap-2'>
                  <button
                    type='button'
                    onClick={handleGoToEvidencePending}
                    className='flex items-center justify-center gap-2 rounded-2xl border border-purple-300 bg-purple-50 px-5 py-3 text-sm font-bold text-purple-700 transition-all active:scale-95 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300'
                  >
                    <PauseCircle size={18} />
                    Pending
                  </button>
                  <button
                    type='button'
                    onClick={handleCloseTicket}
                    disabled={!canClose || actionLoading === 'close'}
                    className={clsx(
                      'flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-95',
                      canClose
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'cursor-not-allowed bg-green-500/40',
                      actionLoading === 'close' && 'opacity-60',
                    )}
                    title={
                      !canClose
                        ? `Lengkapi: ${missingItems.join(', ')}`
                        : undefined
                    }
                  >
                    {actionLoading === 'close' ? (
                      <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    {actionLoading === 'close' ? 'Menutup...' : 'Close'}
                  </button>
                </div>
                {!canClose && missingItems.length > 0 && (
                  <p className='text-center text-[10px] font-medium text-red-500'>
                    Lengkapi: {missingItems.join(', ')}
                  </p>
                )}
              </div>
            ) : isPending(status) ? (
              <div className='flex w-full gap-2'>
                <button
                  type='button'
                  onClick={() => router.push('/teknisi')}
                  className='flex-1 rounded-2xl border border-(--border) bg-(--surface-2) py-3 text-sm font-bold text-(--text-secondary) transition-all active:scale-95'
                >
                  Kembali
                </button>
                <button
                  type='button'
                  onClick={handleResume}
                  disabled={actionLoading === 'resume'}
                  className='bg-primary flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60'
                >
                  {actionLoading === 'resume' ? (
                    <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                  ) : (
                    <Wrench size={18} />
                  )}
                  {actionLoading === 'resume' ? 'Memproses...' : 'Resume'}
                </button>
              </div>
            ) : isAssigned(status) ? (
              <button
                type='button'
                onClick={handlePickup}
                disabled={actionLoading === 'pickup'}
                className='bg-primary flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60'
              >
                {actionLoading === 'pickup' ? (
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                ) : (
                  <Clock size={18} />
                )}
                {actionLoading === 'pickup' ? 'Memproses...' : 'Ambil Ticket'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
