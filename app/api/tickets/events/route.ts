export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { registerSSEConnection, unregisterSSEConnection } from '@/app/libs/sseBroadcast';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      registerSSEConnection(controller);

      // Send initial heartbeat immediately
      ctrl.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`,
        ),
      );

      // Keep-alive heartbeat every 20 seconds
      const heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`,
            ),
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unregisterSSEConnection(controller);
        try {
          ctrl.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // penting untuk nginx/reverse proxy
    },
  });
}
