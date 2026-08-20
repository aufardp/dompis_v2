'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
} from 'react';
import { MapPin } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';

export interface AddressEditorHandle {
  save: () => Promise<boolean>;
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as SpeechRecognitionWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface AddressEditorProps {
  ticketId: number;
  serviceNo?: string | null;
  initialAddress?: string | null;
  suggestion?: string | null;
  canEdit: boolean;
  hideOwnSave?: boolean;
  ref?: React.Ref<AddressEditorHandle>;
  onError: (error: string | null) => void;
  onAddressSaved?: (address: string) => void;
  onAddressChange?: (address: string) => void;
}

export default function AddressEditor({
  ticketId,
  serviceNo,
  initialAddress,
  suggestion,
  canEdit,
  hideOwnSave = false,
  ref,
  onError,
  onAddressSaved,
  onAddressChange,
}: AddressEditorProps) {
  const [alamatInitial, setAlamatInitial] = useState(initialAddress || '');
  const [alamatValue, setAlamatValue] = useState(initialAddress || '');
  const [alamatEditing, setAlamatEditing] = useState(
    canEdit && !initialAddress?.trim(),
  );
  const [alamatSaving, setAlamatSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [bankDraft, setBankDraft] = useState<string | null>(null);
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(
    null,
  );
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const voiceRecRef = useRef<{ abort: () => void } | null>(null);
  const onAddressSavedRef = useRef(onAddressSaved);
  onAddressSavedRef.current = onAddressSaved;

  const alamatTrim = alamatValue.trim();
  const alamatInitialTrim = alamatInitial.trim();
  const isAlamatEmpty = alamatTrim.length === 0;
  const isAlamatDirty = alamatTrim !== alamatInitialTrim;
  const isFilled = alamatInitialTrim.length > 0;

  const activeSuggestion =
    suggestion &&
    suggestion.trim() &&
    suggestion !== dismissedSuggestion &&
    alamatTrim !== suggestion.trim()
      ? suggestion.trim()
      : null;

  const MAX_LENGTH = 255;

  useEffect(() => {
    onAddressChange?.(alamatValue);
  }, [alamatValue, onAddressChange]);

  useEffect(() => {
    const recognition = getSpeechRecognition();
    setVoiceSupported(Boolean(recognition));
  }, []);

  // Fetch remote address if initial is empty
  useEffect(() => {
    let cancelled = false;

    const init = String(initialAddress ?? '');
    setAlamatInitial(init);
    setAlamatValue(init);
    setAlamatEditing(canEdit && init.trim().length === 0);
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
            onAddressSavedRef.current?.(remoteAlamat);
          }
        } catch {
          // ignore
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [ticketId, initialAddress, canEdit]);

  // Fetch bank-location draft (riwayat alamat per service_no)
  useEffect(() => {
    let cancelled = false;
    if (!ticketId || !serviceNo) return;
    if (alamatInitial.trim().length > 0 || bankDraft) return;

    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/${ticketId}/location-bank?serviceNo=${encodeURIComponent(serviceNo)}`,
        );
        if (cancelled || !res) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (data?.success && data?.found && data?.data?.alamat) {
          const draft = String(data.data.alamat).trim();
          if (draft && alamatInitial.trim().length === 0) {
            setBankDraft(draft);
          }
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, serviceNo]);

  const useDraft = useCallback(
    (draft: string | null) => {
      if (!draft) return;
      const next = draft.slice(0, MAX_LENGTH);
      setAlamatValue(next);
      setAlamatEditing(true);
      onError(null);
    },
    [onError],
  );

  const handleVoiceInput = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      onError('Voice-to-text tidak didukung browser ini.');
      return;
    }

    if (voiceListening) {
      voiceRecRef.current?.abort();
      setVoiceListening(false);
      return;
    }

    onError(null);
    const rec = new recognition();
    rec.lang = 'id-ID';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      const transcript = String(
        event?.results?.[0]?.[0]?.transcript ?? '',
      ).trim();
      if (transcript) {
        setAlamatValue((prev) =>
          prev.trim() ? `${prev.trim()} ${transcript}` : transcript,
        );
      }
    };
    rec.onerror = () => setVoiceListening(false);
    rec.onend = () => setVoiceListening(false);

    voiceRecRef.current = rec;
    setVoiceListening(true);
    rec.start();
  }, [voiceListening, onError]);

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

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
    }),
    [handleSave],
  );

  // State 1: Empty State
  if (!isFilled && (!alamatEditing || !canEdit)) {
    return (
      <div className='flex flex-col gap-2'>
        <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
          Alamat
        </p>
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

        {(activeSuggestion || bankDraft) && canEdit && (
          <div className='addr-suggestion flex items-start justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 dark:border-blue-500/25 dark:bg-blue-500/10'>
            <div className='min-w-0 flex-1'>
              <p className='mb-1 flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300'>
                <MapPin size={12} className='shrink-0' />
                {activeSuggestion
                  ? 'Perkiraan alamat dari GPS'
                  : 'Alamat dari tag lokasi sebelumnya'}
              </p>
              <p className='truncate text-[12px] leading-snug font-semibold text-slate-700 dark:text-slate-200'>
                {activeSuggestion || bankDraft}
              </p>
            </div>
            <button
              onClick={() => {
                const draft = activeSuggestion || bankDraft;
                if (!draft) return;
                useDraft(draft);
                if (activeSuggestion) setDismissedSuggestion(activeSuggestion);
              }}
              className='inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[10px] bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90'
            >
              Pakai sebagai draft
            </button>
          </div>
        )}
      </div>
    );
  }

  // State 2: Editing State
  if (alamatEditing && canEdit) {
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
        <div className='relative'>
          <textarea
            className='addr-textarea min-h-20 w-full resize-none rounded-[14px] border-2 border-blue-200 bg-blue-50 px-3.25 py-2.75 pr-10 font-sans text-[13.5px] leading-relaxed font-medium text-slate-800 placeholder-slate-300 transition-all outline-none focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]'
            placeholder='Contoh: Jl. Raya Manukan Tama No. 12, RT 03/RW 02, Kel. Lontar, Kec. Sambikerep'
            maxLength={MAX_LENGTH}
            value={alamatValue}
            onChange={(e) => setAlamatValue(e.target.value)}
            disabled={alamatSaving}
          />
          {voiceSupported && canEdit && (
            <button
              type='button'
              onClick={handleVoiceInput}
              disabled={alamatSaving}
              title={
                voiceListening ? 'Hentikan perekaman' : 'Isi alamat pakai suara'
              }
              className={`absolute top-2 right-2 flex h-6.5 w-6.5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                voiceListening
                  ? 'animate-pulse bg-red-500 text-white'
                  : 'bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-600'
              }`}
            >
              {voiceListening ? (
                <span className='h-2 w-2 rounded-full bg-white' />
              ) : (
                <svg
                  width='13'
                  height='13'
                  viewBox='0 0 16 16'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.8'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                >
                  <rect x='5.5' y='2' width='5' height='8' rx='2.5' />
                  <path d='M3 8a5 5 0 0 0 10 0M8 13v2' />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Active suggestion in edit mode */}
        {activeSuggestion && (
          <div className='mt-1.5 flex items-start justify-between gap-2 rounded-[10px] border border-blue-200 bg-blue-50/70 px-2.5 py-2 dark:border-blue-500/25 dark:bg-blue-500/10'>
            <p className='min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-700 dark:text-slate-200'>
              <MapPin size={12} className='mr-1 inline shrink-0' />
              {activeSuggestion}
            </p>
            <button
              type='button'
              onClick={() => {
                useDraft(activeSuggestion);
                setDismissedSuggestion(activeSuggestion);
              }}
              className='inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[10.5px] font-bold text-white transition-opacity hover:opacity-90'
            >
              Pakai
            </button>
          </div>
        )}

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

        {!hideOwnSave && (
          // Save Button
          <button
            onClick={handleSave}
            disabled={alamatSaving || isAlamatEmpty}
            className='btn-save-addr mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.75 rounded-[14px] border-none bg-linear-to-br from-blue-600 to-indigo-600 font-sans text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'
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
        )}
      </div>
    );
  }

  // State 3: Filled State (with Edit button)
  return (
    <>
      <p className='mb-1 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
        Alamat
      </p>
      <div className='addr-filled flex items-start justify-between gap-2.5'>
        <span className='addr-filled-text flex-1 text-[13.5px] leading-relaxed font-semibold text-gray-900 dark:text-gray-100'>
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
