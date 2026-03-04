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
      className='fixed inset-0 z-[60] flex items-end bg-black/50 backdrop-blur-sm'
      onClick={onClose}
    >
      {/* Bottom Sheet */}
      <div
        className='w-full rounded-t-3xl bg-white max-h-[90vh] flex flex-col animate-slide-up shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className='mx-auto mt-2.5 h-1 w-9 rounded-full bg-slate-200 flex-shrink-0' />

        {/* Header */}
        <div className='px-5 pb-4 pt-3 border-b border-slate-100 flex-shrink-0'>
          <div className='flex items-center gap-2.5 mb-2'>
            <div className='w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-lg'>
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
        <div className='flex-1 overflow-y-auto p-5 space-y-4'>
          {/* Error Banner */}
          {error && (
            <div className='rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
              {error}
            </div>
          )}

          {/* Address Input */}
          <div>
            <label className='block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2'>
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
            <div className='flex items-center justify-between mt-2'>
              <span
                className={`text-xs ${isEmpty ? 'text-red-600 font-semibold' : 'text-slate-500'}`}
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
          <div className='rounded-xl bg-blue-50 border border-blue-100 p-3'>
            <p className='text-[11px] font-semibold text-blue-700 mb-1'>
              💡 Tips:
            </p>
            <ul className='text-[10px] text-blue-600 space-y-0.5 list-disc list-inside'>
              <li>Sertakan nama jalan, nomor, RT/RW</li>
              <li>Sebutkan kelurahan dan kecamatan</li>
              <li>Tambahkan kode pos jika ada</li>
              <li>Patokan gedung/landmark terdekat</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className='sticky bottom-0 flex gap-3 border-t border-slate-100 bg-white px-5 py-4 pb-6 flex-shrink-0'>
          <button
            onClick={handleCancel}
            disabled={saving}
            className='flex-1 h-[50px] rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-100 transition-colors disabled:opacity-50'
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className='flex-1 h-[50px] rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:shadow-none'
          >
            {saving ? (
              <>
                <span className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
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
