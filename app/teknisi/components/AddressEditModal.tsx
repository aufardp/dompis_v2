'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Props {
  ticketId: number;
  initialAddress?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (newAddress: string) => void;
}

const MAX_LENGTH = 255;

export default function AddressEditModal({
  ticketId,
  initialAddress = '',
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [addressValue, setAddressValue] = useState(initialAddress || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressTrim = addressValue.trim();
  const isEmpty = addressTrim.length === 0;
  const isDirty = addressTrim !== (initialAddress || '').trim();
  const canSave = !isEmpty && isDirty && !saving;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAddressValue(initialAddress || '');
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initialAddress]);

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          patch: { alamat: addressTrim },
        }),
      });

      if (!res) {
        setError('Gagal menyimpan alamat');
        return;
      }

      const data = await res.json();

      if (data.success) {
        onSaved(addressTrim);
        onClose();
      } else {
        setError(data.message || 'Gagal menyimpan alamat');
      }
    } catch {
      setError('Terjadi kesalahan saat menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAddressValue(initialAddress || '');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-60 flex items-end bg-black/50 backdrop-blur-sm'
      onClick={onClose}
    >
      {/* Bottom Sheet */}
      <div
        className='animate-slide-up flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className='mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-slate-200' />

        {/* Header */}
        <div className='shrink-0 border-b border-slate-100 px-5 pt-3 pb-4'>
          <div className='mb-2 flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-lg'>
              📍
            </div>
            <div>
              <h2 className='text-base font-bold text-slate-900'>
                Edit Alamat
              </h2>
              <p className='text-[11px] text-slate-500'>
                Masukkan alamat lengkap pelanggan
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className='flex-1 space-y-4 overflow-y-auto p-5'>
          {/* Error Banner */}
          {error && (
            <div className='rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
              {error}
            </div>
          )}

          {/* Address Input */}
          <div>
            <label className='mb-2 block text-[11px] font-bold tracking-wide text-slate-500 uppercase'>
              Alamat Lengkap
            </label>
            <textarea
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={5}
              placeholder='Contoh: Jl. Mawar No. 123, RT 01/RW 02, Kel. Sukamaju, Kec. Cicendo, Bandung 40111'
              className='w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none disabled:bg-slate-100'
              disabled={saving}
            />
            <div className='mt-2 flex items-center justify-between'>
              <span
                className={`text-xs ${isEmpty ? 'font-semibold text-red-600' : 'text-slate-500'}`}
              >
                {isEmpty ? '⚠ Alamat wajib diisi' : 'Alamat lengkap'}
              </span>
              <span
                className={`text-xs font-medium ${
                  addressValue.length > MAX_LENGTH - 20
                    ? 'text-orange-600'
                    : 'text-slate-400'
                }`}
              >
                {addressValue.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Tips */}
          <div className='rounded-xl border border-blue-100 bg-blue-50 p-3'>
            <p className='mb-1 text-[11px] font-semibold text-blue-700'>
              💡 Tips:
            </p>
            <ul className='list-inside list-disc space-y-0.5 text-[10px] text-blue-600'>
              <li>Sertakan nama jalan, nomor, RT/RW</li>
              <li>Sebutkan kelurahan dan kecamatan</li>
              <li>Tambahkan kode pos jika ada</li>
              <li>Patokan gedung/landmark terdekat</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className='sticky bottom-0 flex shrink-0 gap-3 border-t border-slate-100 bg-white px-5 py-4 pb-6'>
          <button
            onClick={handleCancel}
            disabled={saving}
            className='h-12.5 flex-1 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50'
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className='flex h-12.5 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 text-sm font-black text-white shadow-lg shadow-blue-200 transition-all hover:shadow-xl hover:shadow-blue-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none'
          >
            {saving ? (
              <>
                <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
                Menyimpan...
              </>
            ) : (
              <>
                <span className='text-base'>💾</span>
                Simpan Alamat
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
