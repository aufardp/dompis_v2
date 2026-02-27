import prisma from '@/app/libs/prisma';
import { TechEventPayload } from '@/app/libs/integrations/techEventTypes';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

export type CreateTechEventInput = Omit<
  TechEventPayload,
  'event_id' | 'occurred_at'
>;

export async function createTechEvent(
  input: CreateTechEventInput,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const eventId = randomUUID();

  // ✅ Always use UTC ISO
  const occurredAt = new Date().toISOString();

  const payload: TechEventPayload = {
    event_id: eventId,
    event_type: input.event_type,
    occurred_at: occurredAt,
    ticket: input.ticket,
    status: input.status,
    old_technician: input.old_technician,
    new_technician: input.new_technician,
    actor: input.actor,
  };

  const db = tx ?? prisma;

  await db.tech_event_outbox.create({
    data: {
      event_id: eventId,
      event_type: input.event_type,
      payload,
      status: 'PENDING',
      attempt_count: 0,
      next_attempt_at: null,
    },
  });

  return eventId;
}
