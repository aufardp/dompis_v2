'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, ScanLine, ChevronLeft, Crosshair } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import MiniMap from './MiniMap';

const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner),
  { ssr: false },
);

export type LocationTagState = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  barcodeDc: string;
  deviceName: string;
  locationSource: 'manual_tag' | 'reused_bank_data';
};

interface BankLocationData {
  serviceNo: string;
  customerName: string | null;
  alamat: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  deviceName: string | null;
  barcodeDc: string | null;
  workzone: string | null;
  taggedCount: number;
  lastTicketIncident: string | null;
  lastTaggedAt: string | null;
  lastTechnician: string | null;
}

interface LocationTaggerProps {
  ticketId: number;
  serviceNo?: string | null;
  contactName?: string | null;
  alamat?: string | null;
  deviceName?: string | null;
  canEdit: boolean;
  onError: (err: string | null) => void;
  onLocationChange?: (location: LocationTagState | null) => void;
}

type Mode = 'idle' | 'confirm' | 'editing' | 'filled';

const MAX_BARCODE_LENGTH = 150;

function formatTaggedDate(value?: string | null) {
  if (!value) return 'tanggal tidak diketahui';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'tanggal tidak diketahui';
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'tanggal tidak diketahui';
  }
}

function latLngStringIfValid(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export default function LocationTagger({
  ticketId,
  serviceNo,
  contactName,
  alamat,
  deviceName,
  canEdit,
  onError,
  onLocationChange,
}: LocationTaggerProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [bank, setBank] = useState<BankLocationData | null>(null);
  const [bankLoading, setBankLoading] = useState(false);

  // Form fields (editing / reuse state)
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [accuracyWarning, setAccuracyWarning] = useState(false);
  const [barcodeDc, setBarcodeDc] = useState('');
  const [deviceValue, setDeviceValue] = useState(deviceName ?? '');
  const [locating, setLocating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanningError, setScanningError] = useState(false);

  // Fetch bank data on mount
  useEffect(() => {
    let cancelled = false;
    if (!ticketId || !serviceNo) {
      if (!cancelled) setMode('idle');
      return;
    }

    setBankLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticketId}/location-bank?serviceNo=${encodeURIComponent(serviceNo)}`,
        );
        if (cancelled || !res) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (data?.success && data?.found && data?.data) {
          setBank(data.data as BankLocationData);
          setLat(data.data.latitude ?? null);
          setLng(data.data.longitude ?? null);
          setAccuracy(data.data.accuracyMeters ?? null);
          setBarcodeDc(data.data.barcodeDc ?? '');
          setDeviceValue(data.data.deviceName ?? deviceName ?? '');
        } else {
          setBank(null);
        }
      } catch {
        if (!cancelled) setBank(null);
      } finally {
        if (!cancelled) setBankLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, serviceNo]);

  const handleOpenFromEmpty = useCallback(() => {
    onError(null);
    if (bank) {
      setMode('confirm');
    } else {
      setMode('editing');
    }
  }, [bank, onError]);

  const emitChange = useCallback(
    (next: LocationTagState | null) => {
      onLocationChange?.(next);
    },
    [onLocationChange],
  );

  // "Data Masih Benar" — reuse bank data, no re-tag
  const handleReuse = useCallback(() => {
    if (!bank) return;
    const rebuilt: LocationTagState = {
      latitude: bank.latitude,
      longitude: bank.longitude,
      accuracyMeters: bank.accuracyMeters,
      barcodeDc: bank.barcodeDc ?? '',
      deviceName: bank.deviceName ?? deviceName ?? '',
      locationSource: 'reused_bank_data',
    };
    setLat(bank.latitude);
    setLng(bank.longitude);
    setAccuracy(bank.accuracyMeters);
    setBarcodeDc(bank.barcodeDc ?? '');
    setDeviceValue(bank.deviceName ?? deviceName ?? '');
    setMode('filled');
    emitChange(rebuilt);
  }, [bank, deviceName, emitChange]);

  // "Ada yang Berubah" — open editing form prefilled from bank
  const handleEditOpen = useCallback(() => {
    onError(null);
    setMode('editing');
  }, [onError]);

  const requestCurrentPosition = useCallback(() => {
    if (!('geolocation' in navigator)) {
      onError('Geolocation tidak didukung browser ini.');
      return;
    }
    onError(null);
    setLocating(true);
    setAccuracyWarning(false);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const freshLat = pos.coords.latitude;
        const freshLng = pos.coords.longitude;
        const freshAccuracy = Math.round(pos.coords.accuracy);
        setLat(freshLat);
        setLng(freshLng);
        setAccuracy(freshAccuracy);
        setAccuracyWarning(freshAccuracy > 100);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        onError(`Gagal mengambil lokasi: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, [onError]);

  const exposeManualTag = useCallback(() => {
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      onError('Ambil atau koreksi titik lokasi di peta terlebih dahulu.');
      return;
    }
    if (!barcodeDc.trim()) {
      onError('Barcode DC wajib diisi (scan atau ketik manual).');
      return;
    }

    const rebuilt: LocationTagState = {
      latitude: lat,
      longitude: lng,
      accuracyMeters: accuracy,
      barcodeDc: barcodeDc.trim(),
      deviceName: deviceValue.trim() || deviceName || '',
      locationSource: 'manual_tag',
    };
    setMode('filled');
    emitChange(rebuilt);
  }, [lat, lng, accuracy, barcodeDc, deviceValue, deviceName, onError, emitChange]);

  const handleCancel = useCallback(() => {
    onError(null);
    if (bank) {
      setLat(bank.latitude);
      setLng(bank.longitude);
      setBarcodeDc(bank.barcodeDc ?? '');
      setDeviceValue(bank.deviceName ?? deviceName ?? '');
      setMode('filled');
      emitChange(null);
    } else {
      setLat(null);
      setLng(null);
      setAccuracy(null);
      setBarcodeDc('');
      setDeviceValue(deviceName ?? '');
      setMode('idle');
      emitChange(null);
    }
    setScanOpen(false);
  }, [bank, deviceName, onError, emitChange]);

  const handleScanResult = useCallback(
    (results: Array<{ rawValue: string }>) => {
      const first = results?.[0];
      if (!first?.rawValue) return;
      setBarcodeDc(first.rawValue);
      setScanOpen(false);
      setScanningError(false);
    },
    [],
  );

  const coordsLabel = latLngStringIfValid(lat, lng);

  // ── Empty state ────────────────────────────────────────────────
  if (mode === 'idle') {
    return (
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <div className='h-1.75 w-1.75 shrink-0 rounded-full bg-amber-500' />
          <span className='text-[13px] font-medium text-slate-400 italic'>
            {bankLoading ? 'Memuat data lokasi...' : 'Lokasi belum ditag'}
          </span>
        </div>
        {canEdit && !bankLoading && (
          <button
            onClick={handleOpenFromEmpty}
            className='inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] border-[1.5px] border-blue-200 bg-blue-50 px-3 py-1.75 text-[12px] font-bold text-blue-600 transition-all hover:bg-blue-100'
          >
            <MapPin size={12} />
            Tag Lokasi
          </button>
        )}
      </div>
    );
  }

  // ── Confirm banner (bank data exists) ──────────────────────────
  if (mode === 'confirm' && bank) {
    const previewLat = Number.isFinite(bank.latitude) ? bank.latitude : 0;
    const previewLng = Number.isFinite(bank.longitude) ? bank.longitude : 0;
    return (
      <div className='flex flex-col gap-2.5'>
        <div className='rounded-[14px] border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-500/25 dark:bg-blue-500/10'>
          <p className='mb-1 flex items-start gap-1.5 text-[12px] font-bold text-blue-700 dark:text-blue-300'>
            <span className='mt-0.5'>📍</span>
            Lokasi tersedia dari tagging sebelumnya
          </p>
          <p className='mb-1 text-[11px] leading-relaxed text-slate-500'>
            {formatTaggedDate(bank.lastTaggedAt)}
            {bank.lastTechnician ? `, oleh ${bank.lastTechnician}` : ''}
            {bank.taggedCount > 1 ? ` · ${bank.taggedCount}x ditag` : ''}
          </p>
          <div className='space-y-0.5 text-[11.5px] font-medium text-slate-600 dark:text-slate-300'>
            {bank.customerName && <p>Nama: {bank.customerName}</p>}
            {bank.deviceName && <p>ODP: {bank.deviceName}</p>}
            {bank.barcodeDc && <p>Barcode DC: {bank.barcodeDc}</p>}
          </div>
          {latLngStringIfValid(previewLat, previewLng) && (
            <div className='mt-2'>
              <MiniMap
                lat={previewLat}
                lng={previewLng}
                draggable={false}
                className='h-32!'
              />
            </div>
          )}
          <div className='mt-2.5 flex gap-2'>
            <button
              onClick={handleReuse}
              className='flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-blue-600 font-sans text-[12.5px] font-bold text-white transition-opacity hover:opacity-90'
            >
              ✓ Data Masih Benar
            </button>
            <button
              onClick={handleEditOpen}
              className='flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-blue-300 bg-white font-sans text-[12.5px] font-bold text-blue-600 transition-colors hover:bg-blue-50'
            >
              ✏️ Ada yang Berubah
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Editing state ──────────────────────────────────────────────
  if (mode === 'editing') {
    const mapLat = lat ?? 0;
    const mapLng = lng ?? 0;
    const hasCoords = lat !== null && lng !== null;

    return (
      <div className='flex flex-col gap-0'>
        {/* Header */}
        <div className='mb-2.5 flex items-center justify-between'>
          <span className='flex items-center gap-1.5 text-[12px] font-bold text-blue-600'>
            <MapPin size={15} />
            Tag Lokasi Gangguan
          </span>
          <button
            onClick={handleCancel}
            className='cursor-pointer rounded-lg border-none bg-none p-[4px_8px] text-[11px] font-bold text-slate-400 transition-colors hover:bg-slate-100'
          >
            Batal
          </button>
        </div>

        {/* Info pelanggan read-only */}
        <div className='mb-2 grid grid-cols-2 gap-2'>
          <div className='rounded-[10px] bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60'>
            <p className='mb-0.5 text-[9.5px] font-bold tracking-wide text-slate-400 uppercase'>
              Customer
            </p>
            <p className='truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200'>
              {contactName || '-'}
            </p>
          </div>
          <div className='rounded-[10px] bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60'>
            <p className='mb-0.5 text-[9.5px] font-bold tracking-wide text-slate-400 uppercase'>
              No. Service
            </p>
            <p className='truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200'>
              {serviceNo || '-'}
            </p>
          </div>
        </div>
        <div className='mb-2 rounded-[10px] bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60'>
          <p className='mb-0.5 text-[9.5px] font-bold tracking-wide text-slate-400 uppercase'>
            Alamat
          </p>
          <p className='text-[11.5px] leading-snug font-medium text-slate-600 dark:text-slate-300'>
            {alamat?.trim() || '-'}
          </p>
        </div>

        {/* Geolocation */}
        <button
          onClick={requestCurrentPosition}
          disabled={locating}
          className='mb-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] border-2 border-blue-200 bg-blue-50 font-sans text-[12.5px] font-bold text-blue-600 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {locating ? (
            <>
              <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600' />
              Mengambil lokasi...
            </>
          ) : (
            <>
              <Crosshair size={15} />
              Ambil Lokasi Saat Ini
            </>
          )}
        </button>

        {/* Mini map */}
        {hasCoords ? (
          <div className='mb-2'>
            <MiniMap
              lat={mapLat}
              lng={mapLng}
              accuracy={accuracy}
              draggable
              className='mb-1 h-40!'
              onPositionChange={(newLat, newLng) => {
                setLat(newLat);
                setLng(newLng);
              }}
            />
            <div className='flex items-center justify-between'>
              <span className='text-[11px] font-semibold text-slate-500 tabular-nums'>
                {coordsLabel}
              </span>
              <div className='flex items-center gap-2'>
                {accuracy !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                      accuracy > 100
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    ±{Math.round(accuracy)}m
                  </span>
                )}
              </div>
            </div>
            {accuracyWarning && (
              <p className='mt-1.5 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400'>
                ⚠️ Akurasi GPS rendah (mohon cek ulang titik di peta)
              </p>
            )}
          </div>
        ) : (
          <div className='mb-2 flex h-32 items-center justify-center rounded-[14px] border border-dashed border-slate-200 bg-slate-50 text-[11.5px] text-slate-400 dark:border-slate-700 dark:bg-slate-800/60'>
            <span className='flex items-center gap-1.5'>
              <MapPin size={13} />
              Ambil lokasi / geser marker untuk koreksi
            </span>
          </div>
        )}

        {/* Barcode DC */}
        <div className='mb-2'>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
            Barcode DC <span className='text-red-500'>*</span>
          </p>
          {scanOpen ? (
            <div className='mb-2 overflow-hidden rounded-[14px] border border-blue-200'>
              <Scanner
                onScan={(results: Array<{ rawValue: string }>) =>
                  handleScanResult(results)
                }
                scanDelay={500}
                constraints={{ facingMode: 'environment' }}
                styles={{ container: { width: '100%', height: 180 } }}
                onError={() => {
                  setScanningError(true);
                  setScanOpen(false);
                }}
              />
              <button
                onClick={() => setScanOpen(false)}
                className='flex h-9 w-full cursor-pointer items-center justify-center gap-1 border-t border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500 hover:bg-slate-100'
              >
                <ChevronLeft size={13} /> Tutup Scanner
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setScanningError(false);
                setScanOpen(true);
              }}
              className='mb-2 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-emerald-200 bg-emerald-50 font-sans text-[12.5px] font-bold text-emerald-600 transition-all hover:bg-emerald-100'
            >
              <ScanLine size={15} />
              Scan Barcode
            </button>
          )}
          <input
            type='text'
            value={barcodeDc}
            onChange={(e) => setBarcodeDc(e.target.value)}
            placeholder={
              scanningError
                ? 'Kamera tidak tersedia, ketik barcode manual di sini'
                : 'Fallback: ketik barcode DC manual'
            }
            maxLength={MAX_BARCODE_LENGTH}
            className='w-full rounded-[12px] border-2 border-slate-200 bg-slate-50 px-3 py-2.5 font-sans text-[13px] font-medium text-slate-800 placeholder-slate-300 transition-all outline-none focus:border-blue-600 focus:bg-white'
          />
          <div className='mt-1 flex justify-end'>
            <span
              className={`text-[10.5px] font-semibold ${
                barcodeDc.length > MAX_BARCODE_LENGTH - 15
                  ? 'text-amber-500'
                  : 'text-slate-400'
              }`}
            >
              {barcodeDc.length}/{MAX_BARCODE_LENGTH}
            </span>
          </div>
        </div>

        {/* Device ODP editable (prefill) */}
        <div className='mb-2'>
          <p className='mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
            ODP / Device Name
          </p>
          <input
            type='text'
            value={deviceValue}
            onChange={(e) => setDeviceValue(e.target.value)}
            maxLength={100}
            className='w-full rounded-[12px] border-2 border-slate-200 bg-slate-50 px-3 py-2.5 font-sans text-[13px] font-medium text-slate-800 transition-all outline-none focus:border-blue-600 focus:bg-white'
          />
        </div>

        {/* Save */}
        <button
          onClick={() => {
            void exposeManualTag();
          }}
          disabled={!isCoordsValid(lat, lng)}
          className='mt-1 flex h-11 w-full cursor-pointer items-center justify-center gap-1.75 rounded-[14px] border-none bg-linear-to-br from-blue-600 to-indigo-600 font-sans text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'
        >
          <MapPin size={14} />
          Simpan Lokasi
        </button>
      </div>
    );
  }

  // ── Filled state ───────────────────────────────────────────────
  return (
    <>
      <p className='mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
        Lokasi
      </p>
      <div className='mb-2 rounded-[14px] border border-green-200 bg-green-50/60 p-2.5 dark:border-green-500/20 dark:bg-green-500/10'>
        <div className='mb-1.5 flex items-center justify-between'>
          <span className='flex items-center gap-1.5 text-[11.5px] font-bold text-green-700 dark:text-green-400'>
            <svg width='12' height='12' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' strokeLinejoin='round'>
              <path d='M13.5 4.5l-8 8L2 9' />
            </svg>
            Lokasi telah ditag
          </span>
          {canEdit && (
            <button
              onClick={handleOpenFromEmpty}
              className='inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[20px] border-[1.5px] border-slate-200 bg-white px-2.5 py-1 font-sans text-[11px] font-bold text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700'
            >
              Edit
            </button>
          )}
        </div>
        {lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && (
          <>
            <p className='truncate text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums'>
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
            <div className='mt-1.5'>
              <MiniMap lat={lat} lng={lng} draggable={false} className='h-28!' />
            </div>
          </>
        )}
        {barcodeDc && (
          <p className='mt-1.5 truncate text-[11px] text-slate-500'>
            Barcode DC: {barcodeDc}
          </p>
        )}
        <p className='mt-0.5 text-[10.5px] text-slate-400'>
          {addedSourceLabel(lat, lng, barcodeDc)}
        </p>
      </div>
    </>
  );
}

function isCoordsValid(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
}

function addedSourceLabel(
  lat: number | null,
  lng: number | null,
  barcodeDc: string,
): string | null {
  if (isCoordsValid(lat, lng) && barcodeDc.trim()) {
    return 'Sumber: tagging manual / reuse bank data';
  }
  return null;
}