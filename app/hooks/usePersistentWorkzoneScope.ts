'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dompis:selected-workzone';
const SYNC_EVENT = 'dompis:workzone-scope';

function normalizeWorkzone(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function readCookieWorkzone(): string {
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${STORAGE_KEY}=`));

  if (!match) return '';

  const encodedValue = match.slice(STORAGE_KEY.length + 1);
  try {
    return normalizeWorkzone(decodeURIComponent(encodedValue));
  } catch {
    return normalizeWorkzone(encodedValue);
  }
}

function readStoredWorkzone(): string {
  if (typeof window === 'undefined') return '';

  try {
    const fromLocalStorage = normalizeWorkzone(window.localStorage.getItem(STORAGE_KEY));
    return fromLocalStorage || readCookieWorkzone();
  } catch {
    return readCookieWorkzone();
  }
}

function persistWorkzone(value: string) {
  const normalized = normalizeWorkzone(value);
  try {
    if (normalized) {
      window.localStorage.setItem(STORAGE_KEY, normalized);
      window.document.cookie = `${STORAGE_KEY}=${encodeURIComponent(normalized)}; path=/; max-age=2592000; samesite=lax`;
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      window.document.cookie = `${STORAGE_KEY}=; path=/; max-age=0; samesite=lax`;
    }
  } catch {
    // Ignore storage failures; the scope still works in-memory for the session.
  }

  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function usePersistentWorkzoneScope(initialWorkzone?: string) {
  const [workzone, setWorkzoneState] = useState(() =>
    normalizeWorkzone(initialWorkzone),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initial = normalizeWorkzone(initialWorkzone);
    if (initialWorkzone !== undefined && initial.length > 0) {
      setWorkzoneState(initial);
      persistWorkzone(initial);
      return;
    }

    setWorkzoneState(readStoredWorkzone());
  }, [initialWorkzone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setWorkzoneState(normalizeWorkzone(event.newValue));
    };

    const handleSync = () => {
      setWorkzoneState(readStoredWorkzone());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SYNC_EVENT, handleSync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SYNC_EVENT, handleSync);
    };
  }, []);

  const setWorkzone = useCallback((value: string) => {
    const normalized = normalizeWorkzone(value);
    setWorkzoneState(normalized);
    if (typeof window === 'undefined') return;
    persistWorkzone(normalized);
  }, []);

  return {
    workzone,
    setWorkzone,
  };
}
