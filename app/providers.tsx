'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/app/contexts/ThemeContext';
import OnlinePresenceHeartbeat from '@/app/components/monitoring/OnlinePresenceHeartbeat';

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
    import('@aejkatappaja/phantom-ui');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OnlinePresenceHeartbeat />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
