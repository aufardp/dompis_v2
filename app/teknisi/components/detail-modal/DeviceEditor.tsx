'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface DeviceEditorProps {
  ticketId: number;
  initialDevice?: string | null;
  canEdit: boolean;
  onError: (error: string | null) => void;
  onDeviceSaved?: (device: string) => void;
}

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

function isDeviceEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  return v.length === 0 || DEVICE_EMPTY_VALUES.includes(v);
}

export default function DeviceEditor({
  ticketId,
  initialDevice,
  canEdit,
  onError,
  onDeviceSaved,
}: DeviceEditorProps) {
  const [deviceInitial, setDeviceInitial] = useState(initialDevice || '');
  const [deviceValue, setDeviceValue] = useState(initialDevice || '');
  const [deviceEditing, setDeviceEditing] = useState(isDeviceEmpty(initialDevice));
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const deviceTrim = deviceValue.trim();
  const deviceInitialTrim = deviceInitial.trim();
  const isDeviceEmptyValue = isDeviceEmpty(deviceValue);
  const isDirty = deviceTrim !== deviceInitialTrim;
  const isFilled = !isDeviceEmpty(deviceInitial);

  const MAX_LENGTH = 100;

  // Sync with initialDevice prop
  useEffect(() => {
    const init = String(initialDevice ?? '');
    setDeviceInitial(init);
    setDeviceValue(init);
    setDeviceEditing(isDeviceEmpty(init));
    setDeviceSaving(false);
  }, [initialDevice]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (isDeviceEmptyValue) {
      onError('Device Name (ODP) wajib diisi sebelum close');
      setDeviceEditing(true);
      return false;
    }

    if (!isDirty) {
      setDeviceEditing(false);
      return true;
    }

    setDeviceSaving(true);
    onError(null);
    try {
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          patch: { deviceName: deviceTrim },
        }),
      });

      if (!res) return false;
      const data = await res.json().catch(() => null);

      if (data?.success) {
        setDeviceInitial(deviceTrim);
        setDeviceValue(deviceTrim);
        setDeviceEditing(false);
        setShowSavedToast(true);
        setTimeout(() => setShowSavedToast(false), 3000);
        onDeviceSaved?.(deviceTrim);
        return true;
      }

      onError(data?.message || 'Gagal update device name (ODP)');
      return false;
    } catch {
      onError('Terjadi kesalahan saat update device name (ODP)');
      return false;
    } finally {
      setDeviceSaving(false);
    }
  }, [
    canEdit,
    isDeviceEmptyValue,
    isDirty,
    ticketId,
    deviceTrim,
    onError,
    onDeviceSaved,
  ]);

  const handleCancel = useCallback(() => {
    setDeviceValue(deviceInitial);
    setDeviceEditing(false);
    onError(null);
  }, [deviceInitial, onError]);

  const handleEditClick = useCallback(() => {
    setDeviceEditing(true);
  }, []);

  // State 1: Empty State
  if (!isFilled && !deviceEditing) {
    return (
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <div className='h-1.75 w-1.75 shrink-0 rounded-full bg-amber-500' />
          <span className='text-[13px] font-medium text-slate-400 italic'>
            Belum diisi
          </span>
        </div>
        {canEdit && (
          <button
            onClick={handleEditClick}
            className='inline-flex shrink-0 items-center gap-1.5 rounded-[20px] border-[1.5px] border-blue-200 bg-blue-50 px-3 py-1.75 text-[12px] font-bold text-blue-600 transition-all hover:bg-blue-100'
          >
            <svg
              viewBox='0 0 16 16'
              fill='none'
              stroke='currentColor'
              strokeWidth='2.2'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-3 w-3'
            >
              <path d='M8 2h6v6M14 2L8 8M4 4H2.5A1.5 1.5 0 0 0 1 5.5v8A1.5 1.5 0 0 0 2.5 15h8A1.5 1.5 0 0 0 12 13.5V12' />
            </svg>
            Isi Device
          </button>
        )}
      </div>
    );
  }

  // State 2: Editing State
  if (deviceEditing) {
    return (
      <div className='flex flex-col gap-0'>
        {/* Header */}
        <div className='mb-2.5 flex items-center justify-between'>
          <span className='flex items-center gap-1.5 text-[12px] font-bold text-blue-600'>
            <svg
              width='13'
              height='13'
              viewBox='0 0 16 16'
              fill='none'
              stroke='currentColor'
              strokeWidth='2.2'
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <rect x='2' y='3' width='12' height='10' rx='2' />
              <path d='M5 7h6M5 10h4' />
            </svg>
            Isi Device Name
          </span>
          <button
            onClick={handleCancel}
            className='cursor-pointer rounded-lg border-none bg-none p-[4px_8px] text-[11px] font-bold text-slate-400 transition-colors hover:bg-slate-100'
          >
            Batal
          </button>
        </div>

        {/* Input */}
        <input
          type='text'
          className='w-full rounded-[14px] border-2 border-blue-200 bg-blue-50 px-3.5 py-2.75 font-sans text-[13.5px] leading-relaxed font-medium text-slate-800 placeholder-slate-300 transition-all outline-none focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]'
          placeholder='Contoh: ODP-RKT-FCK/01 atau ODP-RKT-FCK/01 FCK/D02/15.01'
          maxLength={MAX_LENGTH}
          value={deviceValue}
          onChange={(e) => setDeviceValue(e.target.value)}
          disabled={deviceSaving}
        />

        {/* Meta */}
        <div className='mt-1.5 flex items-center justify-between'>
          <span className='flex items-center gap-1 text-[11px] text-slate-400'>
            <svg
              width='11'
              height='11'
              viewBox='0 0 16 16'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
            >
              <circle cx='8' cy='8' r='7' />
              <path d='M8 7v5M8 5v.5' />
            </svg>
            Contoh: ODP-RKT-FCK/01 atau ODP-RKT-FCK/01 FCK/D02/15.01
          </span>
          <span
            className={`font-variant-numeric-tabular text-[11px] font-semibold text-slate-400 ${
              deviceValue.length > MAX_LENGTH - 15 ? 'text-amber-500' : ''
            }`}
          >
            {deviceValue.length}/{MAX_LENGTH}
          </span>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={deviceSaving || isDeviceEmptyValue}
          className='mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.75 rounded-[14px] border-none bg-linear-to-br from-blue-600 to-indigo-600 font-sans text-[13px] font-black text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'
        >
          {deviceSaving ? (
            <>
              <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
              Menyimpan...
            </>
          ) : (
            <>
              <svg
                width='14'
                height='14'
                viewBox='0 0 16 16'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M13.5 4.5l-8 8L2 9' />
              </svg>
              Simpan Device
            </>
          )}
        </button>
      </div>
    );
  }

  // State 3: Filled State (with Edit button)
  return (
    <>
      <div className='flex items-start justify-between gap-2.5'>
        <span className='flex-1 text-[13.5px] leading-relaxed font-semibold text-slate-100'>
          {deviceTrim}
        </span>
        {canEdit && (
          <button
            onClick={handleEditClick}
            className='inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[20px] border-[1.5px] border-slate-200 bg-slate-50 px-2.5 py-1.25 font-sans text-[11px] font-bold text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700'
          >
            <svg
              width='10'
              height='10'
              viewBox='0 0 16 16'
              fill='none'
              stroke='currentColor'
              strokeWidth='2.2'
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <path d='M11.5 2.5a2 2 0 0 1 2.83 2.83L5 14.5H2v-3L11.5 2.5z' />
            </svg>
            Edit
          </button>
        )}
      </div>
      {/* Saved Toast */}
      {showSavedToast && (
        <div className='mt-2 flex animate-[fadeIn_0.3s_ease] items-center gap-1.5 rounded-[10px] border border-green-200 bg-green-50 px-2.75 py-1.75 text-[11px] font-bold text-green-600'>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <svg
            width='13'
            height='13'
            viewBox='0 0 16 16'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M13.5 4.5l-8 8L2 9' />
          </svg>
          Device berhasil disimpan
        </div>
      )}
    </>
  );
}
