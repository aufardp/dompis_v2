'use client';

import { useRouter } from 'next/navigation';

export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Redirect ke login
    window.location.href = '/login';
    return;
  }

  return res;
}
