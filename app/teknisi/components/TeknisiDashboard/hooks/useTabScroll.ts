// app/teknisi/components/TeknisiDashboard/hooks/useTabScroll.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { TicketFilter } from '../constants/ticket';

interface UseTabScrollOptions {
  currentFilter: TicketFilter;
}

interface UseTabScrollReturn {
  tabsRef: React.RefObject<HTMLDivElement | null>;
  tabButtonRefs: React.MutableRefObject<
    Record<string, HTMLButtonElement | null>
  >;
  showLeftFade: boolean;
  showRightFade: boolean;
}

export function useTabScroll({
  currentFilter,
}: UseTabScrollOptions): UseTabScrollReturn {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateTabFades = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 2) {
      setShowLeftFade(false);
      setShowRightFade(false);
      return;
    }
    setShowLeftFade(el.scrollLeft > 2);
    setShowRightFade(el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const btn = tabButtonRefs.current[currentFilter];
    if (btn) {
      try {
        btn.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      } catch {
        // ignore
      }
    }

    const id = window.setTimeout(() => updateTabFades(), 0);
    return () => window.clearTimeout(id);
  }, [currentFilter, updateTabFades]);

  useEffect(() => {
    updateTabFades();
    const onResize = () => updateTabFades();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateTabFades]);

  return {
    tabsRef,
    tabButtonRefs,
    showLeftFade,
    showRightFade,
  };
}
