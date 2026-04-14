import prisma from '@/app/libs/prisma';
import { TechEventPayload } from '@/app/libs/integrations/techEventTypes';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

const WIB = 'Asia/Jakarta';

export type CreateTechEventInput = Omit<
  TechEventPayload,
  'event_id' | 'occurred_at' | 'event_label'
>;

export async function createTechEvent(
  input: CreateTechEventInput,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const eventId = randomUUID();

  // Gunakan WIB timezone untuk occurred_at
  // Format: "2026-04-14T12:30:00+07:00"
  const occurredAt = formatInTimeZone(
    new Date(),
    WIB,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  );

  // Generate event_label otomatis dari event_type + incident number
  const eventLabel = `${input.event_type}_${input.ticket.incident}`;

  const payload: TechEventPayload = {
    event_id: eventId,
    event_type: input.event_type,
    event_label: eventLabel,
    occurred_at: occurredAt,
    ticket: input.ticket,
    status: input.status,
    old_technician: input.old_technician,
    new_technician: input.new_technician,
    actor: input.actor,
    admin: input.admin ?? null,
  };

  const db = tx ?? prisma;

  await db.tech_event_outbox.create({
    data: {
      event_id: eventId,
      event_type: input.event_type,
      event_label: eventLabel,
      payload,
      status: 'PENDING',
      attempt_count: 0,
      next_attempt_at: null,
    },
  });

  return eventId;
}
