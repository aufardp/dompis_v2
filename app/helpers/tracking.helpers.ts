import { Prisma } from '@prisma/client';

//optimasi tracking
export async function fastTrackingUpdate(
  tx: Prisma.TransactionClient,
  ticketId: number,
  assignedTo: number | null,
  now: Date,
) {
  const ticketExists = await tx.ticket.findUnique({
    where: { id_ticket: ticketId },
    select: { id_ticket: true },
  });

  if (!ticketExists) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

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
    const existing = await tx.ticket_tracking.findUnique({
      where: { ticket_id: ticketId },
    });

    if (existing) {
      await tx.ticket_tracking.update({
        where: { ticket_id: ticketId },
        data: {
          assigned_to: assignedTo,
          assigned_at: now,
          is_active: true,
          closed_at: null,
        },
      });
    } else {
      await tx.ticket_tracking.create({
        data: {
          ticket_id: ticketId,
          assigned_to: assignedTo,
          assigned_at: now,
          is_active: true,
        },
      });
    }
  }
}
