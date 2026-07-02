'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  ImageIcon,
  Moon,
  PauseCircle,
  Plus,
  Sun,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { addHours } from 'date-fns';
import clsx from 'clsx';
import type { Ticket } from '@/app/types/ticket';
import {
  formatDateTimeWIB,
  getSlaHours,
  parseWIBDateInput,
} from '@/app/utils/datetime';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { filesToDataUrls } from './detail-modal/file-preview';

interface EvidenceUploadPageProps {
  ticket: Ticket;
}

// ── Stepper ──────────────────────────────────────────────────
const STEPS = [
  { key: 'ASSIGNED', label: 'Assigned', icon: User },
  { key: 'ON_PROGRESS', label: 'Dikerjakan', icon: Wrench },
  { key: 'PENDING', label: 'Pending', icon: PauseCircle },
  { key: 'CLOSE', label: 'Selesai', icon: CheckCircle2 },
] as const;

function getActiveStep(status: string) {
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

function normalizeStatus(s?: string | null, h?: string | null) {
  return (s ?? h ?? '').toUpperCase().trim() || 'OPEN';
}

// ── Theme hook ───────────────────────────────────────────────
function useThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  }, []);
  return { dark, toggle };
}

// ── Photo requirement types ─────────────────────────────────
const CLOSE_PHOTO_TYPES = [
  { icon: Camera, label: 'Foto Penyebab (Putusnya, ONT rusaknya, dll)' },
  {
    icon: Camera,
    label: 'Foto Perbaikan (Ganti ONT, Tarik Ulang, Penyambungan, dll)',
  },
  { icon: Camera, label: 'Capture SCC (halaman SCC layak)' },
  { icon: Camera, label: 'Foto dengan pelanggan' },
  { icon: Camera, label: 'Foto lokasi pelanggan' },
];

const PENDING_PHOTO_TYPES = [
  {
    icon: Camera,
    label: 'Foto kondisi lokasi saat ini (yang menyebabkan pending)',
  },
  {
    icon: Camera,
    label: 'Foto alat/material yang sedang ditunggu (jika kendala material)',
  },
  { icon: Camera, label: 'Foto kondisi perangkat pelanggan' },
  {
    icon: Camera,
    label: 'Foto bukti koordinasi atau kendala lapangan (opsional)',
  },
  { icon: Camera, label: 'Foto lainnya sebagai pendukung (opsional)' },
];

const MIN_FILES = 2;
const MAX_FILES = 5;

// ── Image compression ────────────────────────────────────────
const MAX_FILE_SIZE_RAW = 15 * 1024 * 1024;
const TARGET_SIZE = 500 * 1024;
const HARD_CAP = 4 * 1024 * 1024;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Compress timeout')), ms),
    ),
  ]);
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const compressPass = (
    img: HTMLImageElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    maxDim: number,
    quality: number,
  ): Promise<File> =>
    new Promise((resolve) => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size > HARD_CAP) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
            }),
          );
        },
        'image/jpeg',
        quality,
      );
    });

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      compressPass(img, canvas, ctx, 1280, 0.75).then((r1) => {
        if (r1.size <= TARGET_SIZE) {
          resolve(r1);
          return;
        }
        compressPass(img, canvas, ctx, 800, 0.6).then((r2) => {
          if (r2.size <= TARGET_SIZE) {
            resolve(r2);
            return;
          }
          compressPass(img, canvas, ctx, 640, 0.5).then((r3) => {
            if (r3.size <= TARGET_SIZE) {
              resolve(r3);
              return;
            }
            compressPass(img, canvas, ctx, 480, 0.4).then(resolve);
          });
        });
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// ── Component ────────────────────────────────────────────────
export default function EvidenceUploadPage({
  ticket,
}: EvidenceUploadPageProps) {
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useThemeToggle();
  const status = normalizeStatus(ticket.status_update, ticket.hasilVisit);
  const activeStep = getActiveStep(status);

  // ── SLA info ────────────────────────────────────────────────
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
      label: `${h}j ${m}m`,
      deadline: formatDateTimeWIB(deadline.toISOString()),
    };
  }, [ticket.reportedDate, ticket.customerType]);

  // ── States ──────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [existingCount, setExistingCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPendingMode, setIsPendingMode] = useState(false);
  const [pendingReason, setPendingReason] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);

  // ── Sync pending mode dari URL ──────────────────────────────
  useEffect(() => {
    const check = () => {
      setIsPendingMode(
        new URLSearchParams(window.location.search).get('mode') === 'pending',
      );
    };
    check();
    window.addEventListener('popstate', check);
    return () => window.removeEventListener('popstate', check);
  }, []);

  const totalFiles = existingCount + selectedFiles.length;
  const isComplete = totalFiles >= MIN_FILES;
  const availableSlots = Math.max(0, MAX_FILES - totalFiles);

  // ── Fetch existing evidence count ───────────────────────────
  useEffect(() => {
    if (!ticket.idTicket) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticket.idTicket}/evidence?scope=close`,
        );
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.success && Array.isArray(data.data)) {
          setExistingCount(data.data.length);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket.idTicket]);

  // ── Back to home ────────────────────────────────────────────
  const handleBack = useCallback(() => {
    router.push('/teknisi');
  }, [router]);

  // ── File handlers ──────────────────────────────────────────
  const handleCompressAndAdd = useCallback(
    async (rawFiles: File[]) => {
      const valid: File[] = [];
      for (const f of rawFiles) {
        if (f.size > MAX_FILE_SIZE_RAW) {
          setError(`${f.name} terlalu besar — maks 15 MB`);
          continue;
        }
        try {
          const compressed = f.type.startsWith('image/')
            ? await withTimeout(compressImage(f), 15000).catch(() => f)
            : f;
          valid.push(compressed);
        } catch {
          valid.push(f);
        }
      }
      if (valid.length === 0) return;

      const remaining = availableSlots;
      const toAdd = valid.slice(0, remaining);
      setSelectedFiles((prev) => [...prev, ...toAdd]);
      void filesToDataUrls(toAdd)
        .then((urls) => setPreviewUrls((prev) => [...prev, ...urls]))
        .catch(() => {});
    },
    [availableSlots],
  );

  const handlePickFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files) handleCompressAndAdd(Array.from(input.files));
    };
    input.click();
  }, [handleCompressAndAdd]);

  const handleRemoveImage = useCallback((idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Upload evidence (reusable) ──────────────────────────────
  const uploadAllFiles = useCallback(
    async (actionType: 'close' | 'pending') => {
      if (!selectedFiles.length) return;
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(
          `Mengupload foto ${i + 1}/${selectedFiles.length}...`,
        );
        const formData = new FormData();
        formData.append('incident', ticket.ticket);
        formData.append('ticketId', String(ticket.idTicket));
        formData.append('actionType', actionType);
        formData.append('files', file);
        const res = await fetchWithAuth('/api/tickets/upload-evidence', {
          method: 'POST',
          body: formData,
          timeoutMs: 120_000,
        });
        if (!res) throw new Error('Upload gagal: tidak ada respon');
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.message || `Upload foto ${i + 1} gagal`);
        }
      }
    },
    [selectedFiles, ticket.ticket, ticket.idTicket],
  );

  // ── Close action: upload + close ticket ──────────────────────
  const handleCloseClick = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setError('Pilih minimal 1 foto untuk diupload');
      return;
    }
    setError(null);
    setActionLoading('close');
    try {
      setUploading(true);
      await uploadAllFiles('close');

      // Clear selected files setelah upload sukses agar tidak double
      setSelectedFiles([]);
      setPreviewUrls([]);
      setExistingCount((prev) => prev + selectedFiles.length);

      // Baca form state dari detail page (RCA, subRCA, detail perbaikan)
      const saved = sessionStorage.getItem(`ticket_form_${ticket.idTicket}`);
      let rca = '';
      let subRca = '';
      let detailPerbaikan = '';
      if (saved) {
        try {
          const p = JSON.parse(saved);
          rca = p.selectedRca || '';
          subRca = p.selectedSubRca || '';
          detailPerbaikan = p.detailPerbaikan || '';
        } catch {}
      }

      const res = await fetchWithAuth('/api/tickets/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          rca,
          subRca,
          descriptionSolutionDompis: detailPerbaikan,
        }),
      });
      if (!res) throw new Error('Tidak ada respon');
      const data = await res.json();
      if (!data.success)
        throw new Error(data.message || 'Gagal menutup ticket');

      sessionStorage.removeItem(`ticket_form_${ticket.idTicket}`);
      router.push('/teknisi');
    } catch (err: any) {
      setError(err.message || 'Gagal close');
    } finally {
      setUploading(false);
      setActionLoading(null);
    }
  }, [selectedFiles.length, uploadAllFiles, router, ticket.idTicket]);

  // ── Pending: toggle mode ────────────────────────────────────
  const handleOpenPending = useCallback(() => {
    setError(null);
    router.replace(
      `/teknisi/ticket/${ticket.idTicket}/evidence?mode=pending`,
    );
  }, [router, ticket.idTicket]);

  const handleCancelPending = useCallback(() => {
    router.push('/teknisi');
  }, [router]);

  const handleSubmitPending = useCallback(async () => {
    if (!pendingReason.trim()) {
      setError('Alasan pending wajib diisi');
      return;
    }
    setError(null);
    setActionLoading('pending');
    try {
      setUploading(true);
      await uploadAllFiles('pending');

      // Clear selected files setelah upload sukses agar tidak double
      setSelectedFiles([]);
      setPreviewUrls([]);
      setExistingCount((prev) => prev + selectedFiles.length);

      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.idTicket,
          pendingDompis: pendingReason.trim(),
          description: pendingReason.trim(),
        }),
      });
      if (!res) throw new Error('Tidak ada respon');
      const data = await res.json();
      if (!data.success)
        throw new Error(data.message || 'Gagal update pending');
      router.push('/teknisi');
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setUploading(false);
      setActionLoading(null);
    }
  }, [pendingReason, uploadAllFiles, ticket.idTicket, router]);

  return (
    <div className='flex min-h-dvh flex-col bg-(--bg)'>
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
          <p className='text-base font-bold text-(--text-primary)'>Dompis</p>
          <p className='truncate text-xs text-(--text-secondary)'>
            Upload Evidence
          </p>
        </div>
        <button
          type='button'
          onClick={toggleTheme}
          className='flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) bg-(--surface-2) text-(--text-secondary) transition-all active:scale-95'
          aria-label='Toggle theme'
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* ── Ticket Summary Card ────────────────────────────────── */}
      <div className='border-b border-(--border) bg-(--surface) px-4 py-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='rounded-md border border-(--border) bg-(--surface-2) px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                {ticket.jenisTiket || 'REG'}
              </span>
              <span className='rounded-md bg-[#0052cc]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0052cc]'>
                On Progress
              </span>
              <span className='font-mono text-xs font-bold text-(--text-secondary)'>
                {ticket.ticket}
              </span>
            </div>
            <p className='mt-2 line-clamp-2 text-sm leading-snug font-semibold text-(--text-primary)'>
              {ticket.summary || ticket.symptom || 'Tidak ada deskripsi'}
            </p>
            {slaInfo && (
              <div className='mt-2 flex items-center gap-1.5'>
                <Clock
                  size={14}
                  className={
                    slaInfo.isOverdue
                      ? 'text-red-500'
                      : 'text-(--text-tertiary)'
                  }
                />
                <span
                  className={clsx(
                    'text-xs font-bold',
                    slaInfo.isOverdue
                      ? 'text-red-500'
                      : 'text-(--text-secondary)',
                  )}
                >
                  SLA Remaining: {slaInfo.isOverdue ? '-' : ''}
                  {slaInfo.label}
                </span>
              </div>
            )}
          </div>
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
                        'bg-[#0052cc] text-white ring-4 ring-[#0052cc]/20',
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
                    isActive && 'text-[#0052cc]',
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

      {/* ── Content ───────────────────────────────────────────── */}
      <div className='flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-36'>
        {!isPendingMode && (
          <>
            {/* Close Photo Requirements */}
            <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
              <p className='mb-2 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                Jenis Foto yang Wajib
              </p>
              <div className='space-y-2'>
                {CLOSE_PHOTO_TYPES.map((pt, i) => (
                  <div key={i} className='flex items-center gap-2.5'>
                    <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0052cc]/10 text-[#0052cc]'>
                      <pt.icon size={14} />
                    </div>
                    <span className='text-xs leading-snug font-medium text-(--text-primary)'>
                      {pt.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {isPendingMode && (
          <>
            {/* Pending Photo Requirements + Reason */}
            <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
              <p className='mb-2 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                Jenis Foto untuk Pending
              </p>
              <div className='space-y-2'>
                {PENDING_PHOTO_TYPES.map((pt, i) => (
                  <div key={i} className='flex items-center gap-2.5'>
                    <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400'>
                      <pt.icon size={14} />
                    </div>
                    <span className='text-xs leading-snug font-medium text-(--text-primary)'>
                      {pt.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className='mt-4 border-t border-(--border) pt-4'>
                <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
                  Alasan Pending
                </p>
                <p className='mb-2 text-xs text-(--text-secondary)'>
                  Jelaskan mengapa tiket perlu di-pending
                </p>
                <textarea
                  value={pendingReason}
                  onChange={(e) => setPendingReason(e.target.value)}
                  placeholder='Contoh: menunggu sparepart, lokasi sulit dijangkau...'
                  rows={3}
                  maxLength={300}
                  className='w-full resize-none rounded-xl border border-(--border) bg-(--surface-2) px-4 py-3 text-sm font-medium text-(--text-primary) shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 focus:outline-none'
                />
              </div>
            </div>
          </>
        )}

        {/* Upload Grid */}
        <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-4'>
          <div className='mb-3 flex items-center justify-between'>
            <h3 className='text-xs font-bold text-(--text-primary)'>
              Unggah Foto
            </h3>
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
                isComplete
                  ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-500/20 dark:bg-green-500/15 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400',
              )}
            >
              {totalFiles}/{MAX_FILES} foto &bull; wajib {MIN_FILES}
            </span>
          </div>

          <div className='grid grid-cols-3 gap-2'>
            {/* Existing evidence placeholder */}
            {existingCount > 0 && (
              <div className='flex aspect-square items-center justify-center rounded-xl border border-(--border) bg-(--surface-2)'>
                <div className='text-center'>
                  <ImageIcon
                    size={20}
                    className='mx-auto text-(--text-tertiary)'
                  />
                  <p className='mt-1 text-[10px] font-bold text-(--text-secondary)'>
                    {existingCount} foto
                  </p>
                </div>
              </div>
            )}

            {/* Uploaded thumbnails */}
            {previewUrls.map((url, idx) => (
              <div key={url} className='relative aspect-square'>
                <img
                  src={url}
                  alt={`Preview ${idx + 1}`}
                  className='h-full w-full rounded-xl border border-(--border) object-cover'
                />
                <button
                  type='button'
                  onClick={() => handleRemoveImage(idx)}
                  className='absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white'
                >
                  <X size={10} />
                </button>
                <span className='absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] font-semibold text-white'>
                  {existingCount + idx + 1}
                </span>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({
              length: Math.max(
                0,
                MAX_FILES - existingCount - selectedFiles.length,
              ),
            }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type='button'
                onClick={handlePickFiles}
                disabled={availableSlots <= 0}
                className='flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-(--border) bg-(--surface-2) text-(--text-muted) transition-all hover:border-[#0052cc]/40 hover:text-[#0052cc] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'
              >
                <Plus size={22} />
              </button>
            ))}

            {/* Add more button when slots available but already have some */}
            {previewUrls.length > 0 && availableSlots > 0 && (
              <button
                type='button'
                onClick={handlePickFiles}
                className='flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-(--border) bg-(--surface-2) text-(--text-muted) transition-all hover:border-[#0052cc]/40 hover:text-[#0052cc] active:scale-95'
              >
                <Plus size={22} />
              </button>
            )}
          </div>

          {availableSlots <= 0 && selectedFiles.length > 0 && (
            <p className='mt-2 text-center text-[10px] font-bold text-green-600 dark:text-green-400'>
              Semua slot foto terisi
            </p>
          )}
        </div>

        {/* Upload progress */}
        {uploading && uploadProgress && (
          <div className='flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'>
            <span className='h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />
            {uploadProgress}
          </div>
        )}
      </div>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className='fixed right-0 bottom-24 left-0 z-30 mx-auto flex w-full max-w-2xl items-center gap-2 bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg'>
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
      <div className='fixed right-0 bottom-0 left-0 z-20 border-t border-(--border) bg-(--surface) px-4 py-3'>
        <div className='mx-auto flex max-w-2xl flex-col gap-2'>
          {isPendingMode ? (
            <div className='flex gap-2'>
              <button
                type='button'
                onClick={handleCancelPending}
                className='flex flex-1 items-center justify-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) py-3 text-sm font-bold text-(--text-secondary) transition-all active:scale-95'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleSubmitPending}
                disabled={actionLoading === 'pending' || !pendingReason.trim()}
                className='flex flex-1 items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60'
              >
                {actionLoading === 'pending' ? (
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                ) : (
                  <PauseCircle size={18} />
                )}
                {actionLoading === 'pending' ? 'Memproses...' : 'Pending'}
              </button>
            </div>
          ) : (
            <>
              <button
                type='button'
                onClick={() => setShowAddMember(true)}
                className='flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--border) bg-(--surface-2) py-2.5 text-sm font-bold text-(--text-secondary) transition-all active:scale-95'
              >
                <Users size={16} />
                Undang Teman
              </button>
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={handleOpenPending}
                  disabled={actionLoading === 'pending' || uploading}
                  className='flex flex-1 items-center justify-center gap-2 rounded-2xl border border-purple-300 bg-purple-50 py-3 text-sm font-bold text-purple-700 transition-all active:scale-95 disabled:opacity-60 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300'
                >
                  <PauseCircle size={18} />
                  {actionLoading === 'pending' ? 'Memproses...' : 'Pending'}
                </button>
                <button
                  type='button'
                  onClick={handleCloseClick}
                  disabled={
                    actionLoading === 'close' ||
                    uploading ||
                    selectedFiles.length === 0
                  }
                  className='flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#10b981] py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60'
                >
                  {actionLoading === 'close' || uploading ? (
                    <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  {uploading
                    ? 'Mengupload...'
                    : actionLoading === 'close'
                      ? 'Memproses...'
                      : 'Close Tiket'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add Member Modal ──────────────────────────────────── */}
      {showAddMember && (
        <AddMemberModal
          ticketId={ticket.idTicket}
          incident={ticket.ticket}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  );
}

// ── Inline AddMemberModal ────────────────────────────────────
function AddMemberModal({
  ticketId,
  incident,
  onClose,
}: {
  ticketId: number;
  incident: string;
  onClose: () => void;
}) {
  const [invite, setInvite] = useState<{
    token: string;
    qrUrl: string;
    expiresAt: string;
    ttlSeconds: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const generateInvite = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, incident }),
      });
      if (!res) throw new Error('No response');
      const data = await res.json();
      if (data.success) {
        setInvite(data.data);
      } else {
        throw new Error(data.message || 'Gagal generate invite');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal generate invite');
    } finally {
      setLoading(false);
    }
  }, [ticketId, incident]);

  const copyLink = useCallback(() => {
    if (!invite?.qrUrl) return;
    navigator.clipboard.writeText(invite.qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [invite]);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm'
      onClick={onClose}
    >
      <div
        className='mx-auto w-full max-w-md rounded-t-3xl bg-(--surface) px-4 pt-4 pb-8 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mx-auto mb-4 h-1 w-10 rounded-full bg-(--border-secondary)' />
        <h3 className='text-base font-bold text-(--text-primary)'>
          Undang Teman
        </h3>
        <p className='mt-1 text-xs text-(--text-secondary)'>
          Bagikan link atau QR code untuk mengundang teknisi lain bergabung
        </p>

        {!invite ? (
          <button
            type='button'
            onClick={generateInvite}
            disabled={loading}
            className='mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0052cc] py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60'
          >
            {loading ? (
              <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
            ) : (
              <Users size={18} />
            )}
            {loading ? 'Memproses...' : 'Buat Undangan'}
          </button>
        ) : (
          <div className='mt-4 space-y-3'>
            <div className='flex justify-center'>
              <div className='rounded-xl border border-(--border) bg-white p-3'>
                {/* QR code placeholder — uses QRCodeSVG if available */}
                <div className='flex h-40 w-40 items-center justify-center rounded-lg bg-(--surface-2) text-(--text-muted)'>
                  <span className='text-xs'>QR Code</span>
                </div>
              </div>
            </div>
            <div className='flex gap-2'>
              <input
                ref={inputRef}
                readOnly
                value={invite.qrUrl}
                className='flex-1 truncate rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5 text-xs font-medium text-(--text-primary)'
              />
              <button
                type='button'
                onClick={copyLink}
                className='shrink-0 rounded-xl bg-[#0052cc] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95'
              >
                {copied ? 'Tersalin' : 'Salin'}
              </button>
            </div>
            {invite.expiresAt && (
              <p className='text-center text-[10px] text-(--text-tertiary)'>
                Berlaku hingga {formatDateTimeWIB(invite.expiresAt)}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className='mt-3 text-xs font-bold text-red-500'>{error}</p>
        )}

        <button
          type='button'
          onClick={onClose}
          className='mt-4 w-full rounded-2xl border border-(--border) bg-(--surface-2) py-3 text-sm font-bold text-(--text-secondary) transition-all active:scale-95'
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
