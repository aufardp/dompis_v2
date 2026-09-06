'use client';

import { useEffect } from 'react';

async function registerFcmToken(t: string | null) {
  if (!t) return;
  try {
    await fetch('/api/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: t, platform: 'android' }),
    });
  } catch {
    /* ignore — best effort */
  }
}

/**
 * Registers the Android WebView's FCM token with the backend once per technician
 * session. The APK also POSTs its token directly; this is the belt-and-suspenders
 * path (token only in localStorage / bridge, or refreshed via setAndroidToken).
 */
export default function FcmTokenRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bridge = (window as unknown as {
      AndroidBridge?: { getAndroidToken?: () => string | null };
    }).AndroidBridge;

    const stored = (() => {
      try {
        return localStorage.getItem('fcm_token');
      } catch {
        return null;
      }
    })();

    const token = stored || (bridge?.getAndroidToken?.() ?? null);
    void registerFcmToken(token);

    (window as unknown as { setAndroidToken?: (t: string) => void }).setAndroidToken = (
      t: string,
    ) => {
      try {
        localStorage.setItem('fcm_token', t);
      } catch {
        /* ignore */
      }
      void registerFcmToken(t);
    };
  }, []);

  return null;
}
