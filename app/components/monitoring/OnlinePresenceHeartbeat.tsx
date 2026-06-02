'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 30_000;
const PUBLIC_PATHS = new Set(['/', '/login', '/register']);

function isPublicLocation(pathname: string | null | undefined) {
  return !pathname || PUBLIC_PATHS.has(pathname);
}

async function sendHeartbeat() {
  if (typeof window === 'undefined') return;

  const { pathname, search } = window.location;
  if (isPublicLocation(pathname)) return;

  await fetch('/api/monitoring/heartbeat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: `${pathname}${search}`,
    }),
  }).catch(() => undefined);
}

export default function OnlinePresenceHeartbeat() {
  const pathname = usePathname();
  const isPublicPath = isPublicLocation(pathname);

  useEffect(() => {
    if (typeof window === 'undefined' || !pathname || isPublicPath) return;

    void sendHeartbeat();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    };
    const onPageHide = () => {
      void sendHeartbeat();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isPublicPath, pathname]);

  return null;
}
