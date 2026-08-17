'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dompis:selected-branch';
const SYNC_EVENT = 'dompis:branch-scope';

function normalizeBranch(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function readCookieBranch(): string {
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${STORAGE_KEY}=`));

  if (!match) return '';

  const encodedValue = match.slice(STORAGE_KEY.length + 1);
  try {
    return normalizeBranch(decodeURIComponent(encodedValue));
  } catch {
    return normalizeBranch(encodedValue);
  }
}

function readStoredBranch(): string {
  if (typeof window === 'undefined') return '';

  try {
    const fromLocalStorage = normalizeBranch(window.localStorage.getItem(STORAGE_KEY));
    return fromLocalStorage || readCookieBranch();
  } catch {
    return readCookieBranch();
  }
}

function persistBranch(value: string) {
  const normalized = normalizeBranch(value);
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

export function usePersistentBranchScope(initialBranch?: string) {
  const [branch, setBranchState] = useState(() => {
    if (typeof window === 'undefined') return '';
    const stored = readStoredBranch();
    return initialBranch !== undefined && normalizeBranch(initialBranch).length > 0
      ? normalizeBranch(initialBranch)
      : stored;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initial = normalizeBranch(initialBranch);
    if (initialBranch !== undefined && initial.length > 0) {
      setBranchState(initial);
      persistBranch(initial);
      return;
    }

    setBranchState(readStoredBranch());
  }, [initialBranch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setBranchState(normalizeBranch(event.newValue));
    };

    const handleSync = () => {
      setBranchState(readStoredBranch());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SYNC_EVENT, handleSync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SYNC_EVENT, handleSync);
    };
  }, []);

  const setBranch = useCallback((value: string) => {
    const normalized = normalizeBranch(value);
    setBranchState(normalized);
    if (typeof window === 'undefined') return;
    persistBranch(normalized);
  }, []);

  return {
    branch,
    setBranch,
  };
}
