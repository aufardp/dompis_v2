import { cookies } from 'next/headers';

export async function fetchWithAuthServer(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      cookie: cookieHeader,
    },
  });
}
