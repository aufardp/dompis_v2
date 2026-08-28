'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const LEGACY_KEY = 'dompis:selected-workzone';

function normalizeWorkzone(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function readLegacyWorkzone(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromLS = normalizeWorkzone(window.localStorage.getItem(LEGACY_KEY));
    if (fromLS) return fromLS;
  } catch {}
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((e) => e.startsWith(`${LEGACY_KEY}=`));
  if (!match) return '';
  const enc = match.slice(LEGACY_KEY.length + 1);
  try {
    return normalizeWorkzone(decodeURIComponent(enc));
  } catch {
    return normalizeWorkzone(enc);
  }
}

function clearLegacyWorkzone() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {}
  try {
    window.document.cookie = `${LEGACY_KEY}=; path=/; max-age=0; samesite=lax`;
  } catch {}
}

export function useUrlWorkzoneScope() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const workzone = normalizeWorkzone(searchParams.get('workzone'));

  const setWorkzone = useCallback(
    (value: string) => {
      const normalized = normalizeWorkzone(value);
      const params = new URLSearchParams(searchParams.toString());
      if (normalized) params.set('workzone', normalized);
      else params.delete('workzone');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      clearLegacyWorkzone();
    },
    [router, pathname, searchParams],
  );

  return { workzone, setWorkzone, readLegacyWorkzone, clearLegacyWorkzone };
}
