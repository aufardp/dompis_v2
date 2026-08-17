'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

export type RcaSuggestionItem = {
  rca: string;
  subRca: string | null;
  descriptionSolutionDompis: string | null;
  count: number;
  matchRate: number;
  likely: boolean;
};

export type RcaSuggestionState =
  | { status: 'idle'; reason: null }
  | { status: 'loading'; reason: null }
  | { status: 'loaded'; reason: 'ok'; suggestions: RcaSuggestionItem[]; totalClosedAnalysed: number }
  | { status: 'loaded'; reason: 'insufficient_data'; suggestions: []; totalClosedAnalysed: number }
  | { status: 'error'; reason: null };

export function useRcaSuggestions(
  deviceName: string | null | undefined,
  symptom: string | null | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<RcaSuggestionState>({
    status: 'idle',
    reason: null,
  });
  const cacheRef = useRef<Map<string, RcaSuggestionState>>(new Map());
  const requestIdRef = useRef(0);

  const device = (deviceName ?? '').trim();

  const load = useCallback(() => {
    if (!enabled || !device) {
      setState({ status: 'idle', reason: null });
      return;
    }

    const cacheKey = `${device.toLowerCase()}::${(symptom ?? '').trim().toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setState(cached);
      return;
    }

    const requestId = ++requestIdRef.current;
    setState({ status: 'loading', reason: null });

    const params = new URLSearchParams({ deviceName: device });
    const sym = (symptom ?? '').trim();
    if (sym) params.set('symptom', sym);

    void fetchWithAuth(`/api/tickets/rca-suggestion?${params.toString()}`)
      .then(async (res) => {
        if (!res) return;
        const json = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || !json.success) {
          setState({ status: 'error', reason: null });
          return;
        }
        const data = json.data as {
          reason: 'ok' | 'insufficient_data';
          suggestions: RcaSuggestionItem[];
          totalClosedAnalysed: number;
        };
        const nextState: RcaSuggestionState =
          data.reason === 'ok'
            ? {
                status: 'loaded',
                reason: 'ok',
                suggestions: data.suggestions,
                totalClosedAnalysed: data.totalClosedAnalysed,
              }
            : {
                status: 'loaded',
                reason: 'insufficient_data',
                suggestions: [],
                totalClosedAnalysed: data.totalClosedAnalysed,
              };
        cacheRef.current.set(cacheKey, nextState);
        setState(nextState);
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setState({ status: 'error', reason: null });
        }
      });
  }, [enabled, device, symptom]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, load };
}