import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

const AUTO_ASSIGN_LOG_FILE = (() => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `auto-assign-${date}.log`);
})();

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  action: string;
  chunk?: number;
  totalChunks?: number;
  assigned?: number;
  failed?: number;
  ticketId?: number;
  incident?: string;
  duration_ms?: number;
  attempt?: number;
  error?: string;
  will_retry?: boolean;
  message?: string;
  teknisiId?: number;
  teknisiNama?: string;
  reason?: string;
  total_tickets?: number;
  total?: number;
  skipped?: number;
  tickets_processed?: number;
}

function writeLog(entry: LogEntry): void {
  try {
    ensureLogDir();
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(AUTO_ASSIGN_LOG_FILE, logLine, 'utf-8');
  } catch (err) {
    console.error('[AutoAssignLogger] Failed to write log:', err);
  }
}

export const autoAssignLogger = {
  info(action: string, data: Partial<LogEntry> = {}): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      action,
      ...data,
    });
  },

  warn(action: string, data: Partial<LogEntry> = {}): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      action,
      ...data,
    });
  },

  error(action: string, data: Partial<LogEntry> = {}): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      action,
      ...data,
    });
  },

  debug(action: string, data: Partial<LogEntry> = {}): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      action,
      ...data,
    });
  },

  chunkStart(chunk: number, totalChunks: number): void {
    this.info('chunk_start', { chunk, totalChunks } as any);
  },

  chunkComplete(
    chunk: number,
    totalChunks: number,
    assigned: number,
    failed: number,
    duration_ms: number,
    ticketsProcessed: number,
  ): void {
    this.info('chunk_complete', {
      chunk,
      totalChunks,
      assigned,
      failed,
      duration_ms,
      tickets_processed: ticketsProcessed,
    } as any);
  },

  ticketAssigned(
    ticketId: number,
    incident: string,
    teknisiId: number,
    teknisiNama: string,
  ): void {
    this.info('ticket_assigned', {
      ticketId,
      incident,
      teknisiId,
      teknisiNama,
    } as any);
  },

  ticketSkipped(ticketId: number, incident: string, reason: string): void {
    this.info('ticket_skipped', {
      ticketId,
      incident,
      reason,
    } as any);
  },

  ticketFailed(
    ticketId: number,
    incident: string,
    attempt: number,
    error: string,
    willRetry: boolean,
  ): void {
    if (willRetry) {
      this.warn('ticket_retry', {
        ticketId,
        incident,
        attempt,
        error,
        will_retry: true,
      } as any);
    } else {
      this.error('ticket_failed', {
        ticketId,
        incident,
        attempt,
        error,
        will_retry: false,
      } as any);
    }
  },

  batchStart(totalTickets: number): void {
    this.info('batch_start', { total_tickets: totalTickets } as any);
  },

  batchComplete(
    total: number,
    assigned: number,
    skipped: number,
    failed: number,
    duration_ms: number,
  ): void {
    this.info('batch_complete', {
      total,
      assigned,
      skipped,
      failed,
      duration_ms,
    } as any);
  },

  webhookDispatched(
    ticketId: number,
    incident: string,
    success: boolean,
    error?: string,
  ): void {
    if (success) {
      this.debug('webhook_dispatched', { ticketId, incident } as any);
    } else {
      this.warn('webhook_failed', { ticketId, incident, error } as any);
    }
  },
};
