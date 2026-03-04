'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface AddressEditorProps {
  ticketId: number;
  initialAddress?: string | null;
  canEdit: boolean;
  onError: (error: string | null) => void;
  onAddressSaved?: (address: string) => void;
}

export default function AddressEditor({
  ticketId,
  initialAddress,
  canEdit,
  onError,
  onAddressSaved,
}: AddressEditorProps) {
  const [alamatInitial, setAlamatInitial] = useState(initialAddress || '');
  const [alamatValue, setAlamatValue] = useState(initialAddress || '');
  const [alamatEditing, setAlamatEditing] = useState(!initialAddress?.trim());
  const [alamatSaving, setAlamatSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const alamatTrim = alamatValue.trim();
  const alamatInitialTrim = alamatInitial.trim();
  const isAlamatEmpty = alamatTrim.length === 0;
  const isAlamatDirty = alamatTrim !== alamatInitialTrim;
  const isFilled = alamatInitialTrim.length > 0;

  const MAX_LENGTH = 255;

  // Fetch remote address if initial is empty
  useEffect(() => {
    let cancelled = false;

    const init = String(initialAddress ?? '');
    setAlamatInitial(init);
    setAlamatValue(init);
    setAlamatEditing(init.trim().length === 0);
    setAlamatSaving(false);

    if (ticketId && init.trim().length === 0) {
      (async () => {
        try {
          const res = await fetchWithAuth(`/api/tickets/${ticketId}/detail`);
          if (!res) return;
          const data = await res.json().catch(() => null);
          if (cancelled) return;

          const remoteAlamat = String(data?.data?.alamat ?? '').trim();
          if (remoteAlamat) {
            setAlamatInitial(remoteAlamat);
            setAlamatValue(remoteAlamat);
            setAlamatEditing(false);
          }
        } catch {
          // ignore
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [ticketId, initialAddress]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (isAlamatEmpty) {
      onError('Alamat wajib diisi sebelum close');
      setAlamatEditing(true);
      return false;
    }

    if (!isAlamatDirty) {
      setAlamatEditing(false);
      return true;
    }

    setAlamatSaving(true);
    onError(null);
    try {
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          patch: { alamat: alamatTrim },
        }),
      });

      if (!res) return false;
      const data = await res.json().catch(() => null);

      if (data?.success) {
        setAlamatInitial(alamatTrim);
        setAlamatValue(alamatTrim);
        setAlamatEditing(false);
        setShowSavedToast(true);
        setTimeout(() => setShowSavedToast(false), 3000);
        onAddressSaved?.(alamatTrim);
        return true;
      }

      onError(data?.message || 'Gagal update alamat');
      return false;
    } catch {
      onError('Terjadi kesalahan saat update alamat');
      return false;
    } finally {
      setAlamatSaving(false);
    }
  }, [
    canEdit,
    isAlamatEmpty,
    isAlamatDirty,
    ticketId,
    alamatTrim,
    onError,
    onAddressSaved,
  ]);

  const handleCancel = useCallback(() => {
    setAlamatValue(alamatInitial);
    setAlamatEditing(false);
    onError(null);
  }, [alamatInitial, onError]);

  const handleEditClick = useCallback(() => {
    setAlamatEditing(true);
  }, []);

  // State 1: Empty State
  if (!isFilled && !alamatEditing) {
    return (
      <div className='addr-empty flex items-center justify-between gap-2'>
        <div className='addr-empty-left flex items-center gap-2'>
          <div className='addr-empty-dot box-shadow-[0_0_0_3px_rgba(251,191,36,0.2)] h-1.75 w-1.75 shrink-0 rounded-full bg-amber-500' />
          <span className='addr-empty-text text-[13px] font-medium text-slate-400 italic'>
            Belum diisi
          </span>
        </div>
        {canEdit && (
          <button
            onClick={handleEditClick}
            className='btn-isi-alamat inline-flex shrink-0 items-center gap-1.25 rounded-[20px] border-[1.5px] border-blue-200 bg-blue-50 px-3.25 py-1.75 text-[12px] font-bold text-blue-600 transition-all hover:bg-blue-100'
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
            Isi Alamat
          </button>
        )}
      </div>
    );
  }

  // State 2: Editing State
  if (alamatEditing) {
    return (
      <div className='addr-expand-wrap flex animate-[expandDown_0.25s_cubic-bezier(0.32,0.72,0,1)] flex-col gap-0'>
        <style>{`
          @keyframes expandDown {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div className='addr-expand-header mb-2.5 flex items-center justify-between'>
          <span className='addr-expand-title flex items-center gap-1.25 text-[12px] font-bold text-blue-600'>
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
              <circle cx='8' cy='7' r='3' />
              <path d='M8 1C5 1 2.5 3.5 2.5 7c0 4 5.5 8 5.5 8s5.5-4 5.5-8c0-3.5-2.5-6-5.5-6z' />
            </svg>
            Isi Alamat Pelanggan
          </span>
          <button
            onClick={handleCancel}
            className='btn-cancel-addr cursor-pointer rounded-lg border-none bg-none p-[4px_8px] text-[11px] font-bold text-slate-400 transition-colors hover:bg-slate-100'
          >
            Batal
          </button>
        </div>

        {/* Textarea */}
        <textarea
          className='addr-textarea min-h-20 w-full resize-none rounded-[14px] border-2 border-blue-200 bg-blue-50 px-3.25 py-2.75 font-sans text-[13.5px] leading-relaxed font-medium text-slate-800 placeholder-slate-300 transition-all outline-none focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]'
          placeholder='Contoh: Jl. Raya Manukan Tama No. 12, RT 03/RW 02, Kel. Lontar, Kec. Sambikerep'
          maxLength={MAX_LENGTH}
          value={alamatValue}
          onChange={(e) => setAlamatValue(e.target.value)}
          disabled={alamatSaving}
        />

        {/* Meta */}
        <div className='addr-meta mt-1.5 flex items-center justify-between'>
          <span className='addr-hint flex items-center gap-1 text-[11px] text-slate-400'>
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
            Tulis alamat lengkap agar teknisi lain mudah menemukan lokasi
          </span>
          <span
            className={`addr-char-count font-variant-numeric-tabular text-[11px] font-semibold text-slate-400 ${
              alamatValue.length > MAX_LENGTH - 20 ? 'text-amber-500' : ''
            }`}
          >
            {alamatValue.length} / {MAX_LENGTH}
          </span>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={alamatSaving || isAlamatEmpty}
          className='btn-save-addr mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.75 rounded-[14px] border-none bg-linear-to-br from-blue-600 to-indigo-600 font-sans text-[13px] font-black text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'
        >
          {alamatSaving ? (
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
              Simpan Alamat
            </>
          )}
        </button>
      </div>
    );
  }

  // State 3: Filled State (with Edit button)
  return (
    <>
      <div className='addr-filled flex items-start justify-between gap-2.5'>
        <span className='addr-filled-text flex-1 text-[13.5px] leading-relaxed font-semibold text-slate-800'>
          {alamatTrim}
        </span>
        {canEdit && (
          <button
            onClick={handleEditClick}
            className='btn-edit-addr inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[20px] border-[1.5px] border-slate-200 bg-slate-50 px-2.5 py-1.25 font-sans text-[11px] font-bold text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700'
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
        <div className='addr-saved-toast mt-2 flex animate-[fadeIn_0.3s_ease] items-center gap-1.5 rounded-[10px] border border-green-200 bg-green-50 px-2.75 py-1.75 text-[11px] font-bold text-green-600'>
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
          Alamat berhasil disimpan
        </div>
      )}
    </>
  );
}
