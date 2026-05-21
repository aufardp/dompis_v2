import { prisma } from '@/app/libs/prisma';
import { nowWib } from '@/lib/timezone';

function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export const IngestionEventTypes = {
  TICKET_RAW_CREATED: 'TICKET_RAW_CREATED',
  TICKET_RAW_UPDATED: 'TICKET_RAW_UPDATED',
  TICKET_RAW_STATUS_CHANGED: 'TICKET_RAW_STATUS_CHANGED',
  TICKET_RAW_DELETED: 'TICKET_RAW_DELETED',
  INGESTION_COMPLETE: 'INGESTION_COMPLETE',
  INGESTION_FAILED: 'INGESTION_FAILED',
} as const;

export type IngestionEventType = typeof IngestionEventTypes[keyof typeof IngestionEventTypes];

export interface TicketRawEvent {
  sourceTable: string;
  incident: string;
  identity: string;
  previousStatus?: string | null;
  newStatus: string;
  syncVersion: number;
  syncBatchId: string;
}

export interface IngestionCompleteEvent {
  syncBatchId: string;
  tableName: string;
  totalProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  duration: number;
}

export async function emitTicketRawEvent(
  eventType: IngestionEventType,
  payload: TicketRawEvent
): Promise<void> {
  const eventId = generateEventId();

  try {
    await prisma.tech_event_outbox.create({
      data: {
        event_id: eventId,
        event_type: eventType,
        event_label: `External Ingestion: ${payload.incident}`,
        payload: JSON.parse(JSON.stringify(payload)),
        status: 'PENDING',
        attempt_count: 0,
        created_at: nowWib(),
        updated_at: nowWib(),
      },
    });
  } catch (error) {
    console.error('[OutboxEmitter] Failed to emit event:', error);
  }
}

export async function emitIngestionCompleteEvent(
  payload: IngestionCompleteEvent
): Promise<void> {
  const eventId = generateEventId();

  try {
    await prisma.tech_event_outbox.create({
      data: {
        event_id: eventId,
        event_type: IngestionEventTypes.INGESTION_COMPLETE,
        event_label: `Ingestion Complete: ${payload.tableName}`,
        payload: JSON.parse(JSON.stringify(payload)),
        status: 'PENDING',
        attempt_count: 0,
        created_at: nowWib(),
        updated_at: nowWib(),
      },
    });
  } catch (error) {
    console.error('[OutboxEmitter] Failed to emit completion event:', error);
  }
}

export async function emitIngestionFailedEvent(
  syncBatchId: string,
  tableName: string,
  error: string
): Promise<void> {
  const eventId = generateEventId();

  try {
    await prisma.tech_event_outbox.create({
      data: {
        event_id: eventId,
        event_type: IngestionEventTypes.INGESTION_FAILED,
        event_label: `Ingestion Failed: ${tableName}`,
        payload: JSON.parse(JSON.stringify({ syncBatchId, tableName, error, timestamp: nowWib().toISOString() })),
        status: 'PENDING',
        attempt_count: 0,
        created_at: nowWib(),
        updated_at: nowWib(),
      },
    });
  } catch (error) {
    console.error('[OutboxEmitter] Failed to emit failed event:', error);
  }
}

export async function emitBulkEvents(
  events: Array<{ eventType: IngestionEventType; payload: TicketRawEvent }>
): Promise<void> {
  const now = nowWib();
  const eventsToInsert = events.map(({ eventType, payload }) => ({
    event_id: generateEventId(),
    event_type: eventType,
    event_label: `External Ingestion: ${payload.incident}`,
    payload: JSON.parse(JSON.stringify(payload)),
    status: 'PENDING' as const,
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  }));

  if (eventsToInsert.length === 0) return;

  try {
    await prisma.tech_event_outbox.createMany({
      data: eventsToInsert,
    });
  } catch (error) {
    console.error('[OutboxEmitter] Failed to emit bulk events:', error);
  }
}