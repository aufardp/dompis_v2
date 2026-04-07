// In-memory set of active SSE controllers for auto-assign progress
const autoAssignConnections = new Set<ReadableStreamDefaultController>();

export function registerAutoAssignConnection(
  controller: ReadableStreamDefaultController,
) {
  autoAssignConnections.add(controller);
}

export function unregisterAutoAssignConnection(
  controller: ReadableStreamDefaultController,
) {
  autoAssignConnections.delete(controller);
}

export function broadcastAutoAssignProgress(data: {
  type: 'progress' | 'completed' | 'error';
  current: number;
  total: number;
  assigned: number;
  failed: number;
  chunk: number;
  totalChunks: number;
  message?: string;
}) {
  const message = `data: ${JSON.stringify({ ...data, ts: Date.now() })}\n\n`;
  const encoder = new TextEncoder();
  for (const controller of autoAssignConnections) {
    try {
      controller.enqueue(encoder.encode(message));
    } catch {
      autoAssignConnections.delete(controller);
    }
  }
}

export function broadcastAutoAssignError(message: string) {
  broadcastAutoAssignProgress({
    type: 'error',
    current: 0,
    total: 0,
    assigned: 0,
    failed: 0,
    chunk: 0,
    totalChunks: 0,
    message,
  });
}

export function broadcastAutoAssignCompleted(data: {
  total: number;
  assigned: number;
  failed: number;
  skipped: number;
}) {
  broadcastAutoAssignProgress({
    type: 'completed',
    current: data.total,
    total: data.total,
    assigned: data.assigned,
    failed: data.failed,
    chunk: data.total,
    totalChunks: data.total,
  });
}
