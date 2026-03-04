// app/teknisi/components/TeknisiDashboard/hooks/usePullToRefresh.ts

import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  ptrReady: boolean;
  ptrRefreshing: boolean;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const ptrStateRef = useRef({ pulling: false, startY: 0 });
  const [pullDistance, setPullDistance] = useState(0);
  const [ptrReady, setPtrReady] = useState(false);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (ptrRefreshing) return;
    setPtrRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setPtrRefreshing(false);
    }
  }, [onRefresh, ptrRefreshing]);

  useEffect(() => {
    if (disabled) return;

    const THRESHOLD = 64;
    const MAX_PULL = 96;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      if (e.touches.length !== 1) return;
      ptrStateRef.current.pulling = true;
      ptrStateRef.current.startY = e.touches[0].clientY;
      setPullDistance(0);
      setPtrReady(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!ptrStateRef.current.pulling) return;
      if (window.scrollY > 0) {
        ptrStateRef.current.pulling = false;
        setPullDistance(0);
        setPtrReady(false);
        return;
      }

      const currentY = e.touches[0]?.clientY ?? 0;
      const delta = currentY - ptrStateRef.current.startY;
      if (delta <= 0) {
        setPullDistance(0);
        setPtrReady(false);
        return;
      }

      e.preventDefault();

      const eased = Math.min(MAX_PULL, delta * 0.65);
      setPullDistance(eased);
      setPtrReady(eased >= THRESHOLD);
    };

    const onTouchEnd = () => {
      if (!ptrStateRef.current.pulling) return;
      ptrStateRef.current.pulling = false;

      const shouldRefresh = ptrReady;
      setPullDistance(0);
      setPtrReady(false);

      if (shouldRefresh) {
        void handleRefresh();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, ptrReady, handleRefresh]);

  return {
    pullDistance,
    ptrReady,
    ptrRefreshing,
  };
}
