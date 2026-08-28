'use client';

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  window.location.assign('/login');
}

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const REFRESH_FETCH_TIMEOUT_MS = 10_000;
const RECENT_LOGIN_WINDOW_MS = 10_000;
const RECENT_LOGIN_RETRIES = 5;

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRecentLoginAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem('dompis:last-successful-login-at');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function retryAfterRecentLogin(
  doFetch: () => Promise<Response>,
): Promise<Response | null> {
  const loginAt = getRecentLoginAt();
  if (!loginAt) return null;

  const ageMs = Date.now() - loginAt;
  if (ageMs > RECENT_LOGIN_WINDOW_MS) return null;

  let res: Response | null = null;
  for (let attempt = 0; attempt < RECENT_LOGIN_RETRIES; attempt++) {
    await delay(250 * (attempt + 1));
    res = await doFetch();
    if (res.status !== 401) return res;
  }

  return res;
}

export async function fetchWithAuth(
  input: RequestInfo,
  init?: FetchWithAuthInit,
) {
  const doFetch = () => fetchWithTimeout(input, init);

  let res = await doFetch();

  // Token still valid
  if (res.status !== 401) return res;

  const recentLoginRetry = await retryAfterRecentLogin(doFetch);
  if (recentLoginRetry && recentLoginRetry.status !== 401) {
    return recentLoginRetry;
  }

  // Give the browser a short grace period in case auth cookies are still
  // propagating right after login/navigation.
  await delay(150);
  res = await doFetch();
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
        try {
          window.localStorage.removeItem('dompis:selected-branch');
          window.localStorage.removeItem('dompis:selected-workzone');
          window.document.cookie = 'dompis:selected-branch=; path=/; max-age=0; samesite=lax';
          window.document.cookie = 'dompis:selected-workzone=; path=/; max-age=0; samesite=lax';
          const qc = (window as unknown as { __queryClient?: { clear: () => void } }).__queryClient;
          qc?.clear();
        } catch {}
        window.location.assign('/login');
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Upload dengan progres (fetch tidak menyediakan upload progress). Mengerjakan
// streaming multipart via XMLHttpRequest + cookie yang sama seperti fetchWithAuth.
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadWithAuthResult {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}

export function uploadWithAuth(
  input: string | URL,
  formData: FormData,
  opts: {
    method?: string;
    onProgress?: (p: UploadProgress) => void;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<UploadWithAuthResult> {
  const { method = 'POST', onProgress, timeoutMs = 120_000, signal } = opts;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, String(input));
    xhr.withCredentials = true;

    const timer = setTimeout(() => xhr.abort(), timeoutMs);
    const onAbort = () => xhr.abort();
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.({
          loaded: e.loaded,
          total: e.total,
          percent: e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0,
        });
      }
    };

    xhr.onload = () => {
      cleanup();
      const ok = xhr.status >= 200 && xhr.status < 300;
      resolve({
        ok,
        status: xhr.status,
        json: () => {
          try {
            return Promise.resolve(JSON.parse(xhr.responseText || '{}'));
          } catch {
            return Promise.resolve({});
          }
        },
      });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Upload gagal: tidak ada respon'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new Error('Upload gagal: request dibatalkan'));
    };

    xhr.send(formData);
  });
}
