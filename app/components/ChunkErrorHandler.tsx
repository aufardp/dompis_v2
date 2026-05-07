'use client';

import { useEffect, useRef } from 'react';

export default function ChunkErrorHandler() {
  const isMounted = useRef(true);

  useEffect(() => {
    const handleChunkError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';
      
      if (
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('chunk') ||
        errorMessage.includes('net::ERR_FAILED')
      ) {
        console.error('[ChunkErrorHandler] Chunk load failed:', errorMessage);
        
        if (isMounted.current) {
          console.log('[ChunkErrorHandler] Triggering page reload...');
          window.location.reload();
        }
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const reasonStr = String(reason || '');
      
      if (
        reasonStr.includes('Loading chunk') ||
        reasonStr.includes('Failed to fetch') ||
        reasonStr.includes('chunk')
      ) {
        console.error('[ChunkErrorHandler] Unhandled chunk error:', reasonStr);
        
        if (isMounted.current) {
          window.location.reload();
        }
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      isMounted.current = false;
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}