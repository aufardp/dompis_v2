'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/app/contexts/ThemeContext';
import OnlinePresenceHeartbeat from '@/app/components/monitoring/OnlinePresenceHeartbeat';

let globalQueryClient: QueryClient | null = null;
export function getGlobalQueryClient(): QueryClient | null {
  return globalQueryClient;
}

function QueryClearOnUserChange({ queryClient }: { queryClient: QueryClient }) {
  // Clear all queries when logged-in user changes (switch account) to prevent filter nyantol
  // We poll /api/users/me via fetch, but reuse query cache key ['users','me']
  useEffect(() => {
    let lastUserId: number | null = null;
    const check = () => {
      const data = queryClient.getQueryData(['users', 'me']) as { id_user?: number } | undefined;
      const curId = data?.id_user ?? null;
      if (lastUserId !== null && curId !== null && curId !== lastUserId) {
        queryClient.clear();
      }
      lastUserId = curId;
    };
    const id = setInterval(check, 1000);
    // also clear on storage event (logout in other tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dompis:last-successful-login-at') queryClient.clear();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, [queryClient]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 2 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    globalQueryClient = queryClient;
    // expose for fetcher logoutUser
    (window as unknown as { __queryClient?: QueryClient }).__queryClient = queryClient;
    import('@aejkatappaja/phantom-ui');
    return () => {
      if (globalQueryClient === queryClient) globalQueryClient = null;
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryClearOnUserChange queryClient={queryClient} />
      <ThemeProvider>
        <OnlinePresenceHeartbeat />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
