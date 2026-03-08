import { Prisma } from '@prisma/client';

//optimasi tracking
export async function fastTrackingUpdate(
  tx: Prisma.TransactionClient,
  ticketId: number,
  assignedTo: number | null,
  now: Date,
) {
  await tx.ticket_tracking.updateMany({
    where: {
      ticket_id: ticketId,
      is_active: true,
    },
    data: {
      is_active: false,
      closed_at: now,
    },
  });

  if (assignedTo) {
    // Upsert: update existing inactive record or create new one
    await tx.ticket_tracking.upsert({
      where: { ticket_id: ticketId },
      update: {
        assigned_to: assignedTo,
        assigned_at: now,
        is_active: true,
        closed_at: null,
      },
      create: {
        ticket_id: ticketId,
        assigned_to: assignedTo,
        assigned_at: now,
        is_active: true,
      },
    });
  }
}
