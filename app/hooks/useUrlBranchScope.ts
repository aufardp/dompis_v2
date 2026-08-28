'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const LEGACY_KEY = 'dompis:selected-branch';

function normalizeBranch(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function readLegacyBranch(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromLS = normalizeBranch(window.localStorage.getItem(LEGACY_KEY));
    if (fromLS) return fromLS;
  } catch {}
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((e) => e.startsWith(`${LEGACY_KEY}=`));
  if (!match) return '';
  const enc = match.slice(LEGACY_KEY.length + 1);
  try {
    return normalizeBranch(decodeURIComponent(enc));
  } catch {
    return normalizeBranch(enc);
  }
}

function clearLegacyBranch() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {}
  try {
    window.document.cookie = `${LEGACY_KEY}=; path=/; max-age=0; samesite=lax`;
  } catch {}
}

export function useUrlBranchScope() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const branch = normalizeBranch(searchParams.get('branch'));

  const setBranch = useCallback(
    (value: string) => {
      const normalized = normalizeBranch(value);
      const params = new URLSearchParams(searchParams.toString());
      if (normalized) params.set('branch', normalized);
      else params.delete('branch');
      // when branch changes, workzone may become invalid — caller handles, but we keep workzone param as is; Topbar effect will clear if needed
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      // clear legacy once user interacts via URL
      clearLegacyBranch();
    },
    [router, pathname, searchParams],
  );

  return { branch, setBranch, readLegacyBranch, clearLegacyBranch };
}
