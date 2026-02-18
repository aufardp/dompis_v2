'use client';

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  window.location.assign('/login');
}

async function refreshAccessToken() {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
  });

  return res.ok;
}

export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  const doFetch = () =>
    fetch(input, {
      ...init,
      credentials: 'include',
    });

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
