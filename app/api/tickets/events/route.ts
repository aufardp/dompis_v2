export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import {
  initSSERedis,
  registerSSEConnection,
  unregisterSSEConnection,
} from '@/app/libs/sseBroadcast';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin', 'teknisi']);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  await initSSERedis();

  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleanedUp = false;

  const cleanup = (ctrl?: ReadableStreamDefaultController) => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (controller) {
      unregisterSSEConnection(controller);
    }
    const target = ctrl ?? controller;
    if (target) {
      try {
        target.close();
      } catch {
        /* already closed */
      }
    }
  };

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      registerSSEConnection(controller, req.signal);

      // Send initial heartbeat immediately
      ctrl.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`,
        ),
      );

      // Keep-alive heartbeat every 20 seconds
      heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`,
            ),
          );
        } catch {
          cleanup(ctrl);
        }
      }, 20_000);

      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
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
