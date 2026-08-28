'use client';

/**
 * @deprecated URL is now source of truth — this hook now delegates to URL searchParams.
 * Kept for backward compat; new code should use useUrlBranchScope directly.
 * Legacy localStorage/cookie `dompis:selected-branch` is migrated once to `?branch=` then cleared.
 */
import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const LEGACY_KEY = 'dompis:selected-branch';

function normalizeBranch(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function readLegacyBranch(): string {
  if (typeof window === 'undefined') return '';
  try {
    const ls = normalizeBranch(window.localStorage.getItem(LEGACY_KEY));
    if (ls) return ls;
  } catch {}
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

export function usePersistentBranchScope(initialBranch?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasBranchParam = searchParams.has('branch');
  const urlBranch = normalizeBranch(searchParams.get('branch'));

  // URL is source of truth; if URL has explicit param (even empty ?branch=), use it.
  // If no param, fallback to initialBranch (server cookie) for one-time migration.
  let branch: string;
  if (hasBranchParam) branch = urlBranch;
  else if (initialBranch !== undefined && normalizeBranch(initialBranch).length > 0) branch = normalizeBranch(initialBranch);
  else branch = '';

  // One-time migration: legacy storage → URL (only when URL has no branch param)
  useEffect(() => {
    if (hasBranchParam) {
      // URL already explicit — just clear legacy to prevent nyantol on next login
      clearLegacyBranch();
      return;
    }
    const legacy = readLegacyBranch();
    const target = normalizeBranch(initialBranch) || legacy;
    if (target) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('branch', target);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      clearLegacyBranch();
    } else if (legacy) {
      clearLegacyBranch();
    }
  }, [hasBranchParam, initialBranch, pathname, router, searchParams]);

  const setBranch = useCallback(
    (value: string) => {
      const normalized = normalizeBranch(value);
      const params = new URLSearchParams(searchParams.toString());
      if (normalized) params.set('branch', normalized);
      else params.delete('branch');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      clearLegacyBranch();
    },
    [router, pathname, searchParams],
  );

  return { branch, setBranch };
}
