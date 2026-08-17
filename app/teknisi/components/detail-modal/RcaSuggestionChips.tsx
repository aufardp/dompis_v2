'use client';

import { Lightbulb, Loader2, Sparkles, X } from 'lucide-react';
import type { RcaSuggestionState } from '@/app/hooks/useRcaSuggestions';

interface Props {
  state: RcaSuggestionState;
  onPick: (rca: string, subRca: string, descriptionSolutionDompis: string) => void;
  onDismiss?: () => void;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function RcaSuggestionChips({ state, onPick, onDismiss }: Props) {
  if (state.status === 'idle' || state.status === 'loading') {
    if (state.status === 'loading') {
      return (
        <div className='mt-2 flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-xs text-purple-300'>
          <Loader2 size={13} className='animate-spin' />
          Menghitung saran RCA dari tiket historis...
        </div>
      );
    }
    return null;
  }

  if (state.status === 'error') return null;

  if (state.reason === 'insufficient_data') {
    if (state.totalClosedAnalysed === 0) return null;
    return (
      <div className='mt-2 flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2 text-xs text-(--text-tertiary)'>
        <Lightbulb size={13} />
        Data historia belum cukup untuk saran RCA ({state.totalClosedAnalysed} tiket dari minimal 50).
      </div>
    );
  }

  if (state.suggestions.length === 0) {
    return (
      <div className='mt-2 flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2 text-xs text-(--text-tertiary)'>
        <Lightbulb size={13} />
        Tidak ada pola RCA yang cocok ({state.totalClosedAnalysed} tiket dianalisis).
      </div>
    );
  }

  return (
    <div className='mt-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <div className='flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-purple-400 uppercase'>
          <Sparkles size={12} />
          Saran RCA dari {state.totalClosedAnalysed} tiket historis
        </div>
        {onDismiss && (
          <button
            type='button'
            onClick={onDismiss}
            className='p-0.5 text-purple-400 transition-colors hover:text-purple-200'
            aria-label='Tutup saran RCA'
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        {state.suggestions.map((s) => (
          <button
            key={`${s.rca}-${s.subRca ?? ''}`}
            type='button'
            onClick={() =>
              onPick(
                s.rca,
                s.subRca ?? '',
                s.descriptionSolutionDompis ?? '',
              )
            }
            className='inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-100 transition-colors hover:bg-purple-500/25'
          >
            {s.rca}
            {s.subRca ? ` → ${s.subRca}` : ''}
            <span className='text-[10px] text-purple-300/90'>
              {formatPercent(s.matchRate)}
            </span>
            {s.likely && (
              <span className='rounded-full bg-purple-500/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase'>
                Top
              </span>
            )}
          </button>
        ))}
      </div>
      {state.suggestions.some((s) => s.descriptionSolutionDompis) && (
        <p className='mt-2 text-[10px] text-purple-300/70'>
          Pilih chip untuk mengisi RCA, Sub RCA, & detail perbaikan. Anda tetap bisa mengubah isian.
        </p>
      )}
    </div>
  );
}