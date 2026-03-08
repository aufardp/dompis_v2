// In-memory set of active SSE controllers
const activeConnections = new Set<ReadableStreamDefaultController>();

/**
 * Broadcast invalidation signal to all connected admin browsers.
 * Called from mutasi routes (assign, close, pickup, update).
 */
export function broadcastTicketInvalidate(reason?: string) {
  const message = `data: ${JSON.stringify({ type: 'invalidate', reason: reason ?? 'mutation', ts: Date.now() })}\n\n`;
  const encoder = new TextEncoder();
  for (const controller of activeConnections) {
    try {
      controller.enqueue(encoder.encode(message));
    } catch {
      // Connection closed — will be cleaned up on abort
      activeConnections.delete(controller);
    }
  }
}

/**
 * Register an active SSE controller.
 * Called by SSE endpoint when a new connection is established.
 */
export function registerSSEConnection(controller: ReadableStreamDefaultController) {
  activeConnections.add(controller);
}

/**
 * Unregister an active SSE controller.
 * Called by SSE endpoint when a connection is closed.
 */
export function unregisterSSEConnection(controller: ReadableStreamDefaultController) {
  activeConnections.delete(controller);
}
