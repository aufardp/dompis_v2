'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RefreshFn = () => void | Promise<void>;

type UseAutoRefreshOptions = {
  intervalMs: number;
  refreshers: RefreshFn[];
  pauseWhen?: boolean[];
  enabled?: boolean;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  revalidateOnVisible?: boolean;
  jitterRatio?: number;
};

export function useAutoRefresh({
  intervalMs,
  refreshers,
  pauseWhen = [],
  enabled = true,
  revalidateOnFocus = true,
  revalidateOnReconnect = true,
  revalidateOnVisible = true,
  jitterRatio = 0.1,
}: UseAutoRefreshOptions) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const inFlightRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  const pauseKey = useMemo(
    () => (pauseWhen.length > 0 ? pauseWhen.map(Boolean).join('|') : ''),
    [pauseWhen],
  );

  const canRun = useCallback(() => {
    if (!enabled) return false;
    if (intervalMs <= 0) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (pauseWhen.some(Boolean)) return false;
    return true;
  }, [enabled, intervalMs, pauseKey, pauseWhen]);

  const run = useCallback(async () => {
    if (!canRun()) return;
    if (inFlightRef.current) return;
    if (refreshers.length === 0) return;

    inFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.allSettled(
        refreshers.map((fn) => Promise.resolve().then(fn)),
      );
      setLastRefreshedAt(new Date());
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [canRun, refreshers]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    const scheduleNext = () => {
      if (cancelled) return;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

      const jitter =
        jitterRatio > 0
          ? 1 +
            (Math.random() * 2 - 1) * Math.min(Math.max(jitterRatio, 0), 0.5)
          : 1;
      const delay = Math.max(1000, Math.floor(intervalMs * jitter));

      timeoutRef.current = window.setTimeout(async () => {
        await run();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [enabled, intervalMs, jitterRatio, run]);

  useEffect(() => {
    if (!enabled) return;
    if (!revalidateOnFocus) return;

    const onFocus = () => {
      run();
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, revalidateOnFocus, run]);

  useEffect(() => {
    if (!enabled) return;
    if (!revalidateOnReconnect) return;

    const onOnline = () => {
      run();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, revalidateOnReconnect, run]);

  useEffect(() => {
    if (!enabled) return;
    if (!revalidateOnVisible) return;

    const onVisibility = () => {
      if (!document.hidden) run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, revalidateOnVisible, run]);

  return {
    lastRefreshedAt,
    isRefreshing,
    refreshNow: run,
  };
}
