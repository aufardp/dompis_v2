'use client';

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  window.location.assign('/login');
}

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const REFRESH_FETCH_TIMEOUT_MS = 10_000;

type FetchWithAuthInit = RequestInit & {
  timeoutMs?: number;
};

async function refreshAccessToken() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(
      () =>
        controller.abort(
          new DOMException('Refresh token request timed out', 'TimeoutError'),
        ),
      REFRESH_FETCH_TIMEOUT_MS,
    );
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mergeAbortSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal | null,
): AbortSignal {
  if (!externalSignal) return timeoutSignal;
  if (externalSignal.aborted) return externalSignal;

  const controller = new AbortController();
  const abortFrom = () => controller.abort();

  timeoutSignal.addEventListener('abort', abortFrom, { once: true });
  externalSignal.addEventListener('abort', abortFrom, { once: true });

  return controller.signal;
}

function fetchWithTimeout(input: RequestInfo, init?: FetchWithAuthInit) {
  const controller = new AbortController();
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...requestInit } = init ?? {};
  const timeoutId = setTimeout(
    () =>
      controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  return fetch(input, {
    ...requestInit,
    signal: mergeAbortSignals(controller.signal, init?.signal),
    credentials: 'include',
  }).finally(() => clearTimeout(timeoutId));
}

export async function fetchWithAuth(
  input: RequestInfo,
  init?: FetchWithAuthInit,
) {
  const doFetch = () => fetchWithTimeout(input, init);

  let res = await doFetch();

  // Token still valid
  if (res.status !== 401) return res;

  // Avoid refresh loop
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : String(input);
  if (url.includes('/api/auth/refresh') || url.includes('/api/auth/login')) {
    redirectToLogin();
    return;
  }

  // Try refresh once
  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    redirectToLogin();
    return;
  }

  res = await doFetch();
  if (res.status === 401) {
    redirectToLogin();
    return;
  }

  return res;
}

export async function logoutUser(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
