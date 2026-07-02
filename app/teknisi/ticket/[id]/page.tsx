import { notFound } from 'next/navigation';
import type { Ticket } from '@/app/types/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import TicketDetailContent from '@/app/teknisi/components/TicketDetailContent';
import { protectApi } from '@/app/libs/protectApi';
import { getTicketDetailForActor } from '@/app/libs/services/ticketDetail.service';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: Props) {
  const { id } = await params;
  const ticketId = Number(id);

  if (!Number.isFinite(ticketId) || ticketId <= 0) notFound();

  let ticket: Ticket | null = null;
  try {
    const actor = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'teknisi',
    ]);
    ticket = await getTicketDetailForActor(ticketId, actor);
  } catch {
    notFound();
  }

  if (!ticket) notFound();

  const isClosed = isTicketClosed(ticket.status_update);

  return (
    <TicketDetailContent
      ticket={ticket}
      isClosed={isClosed}
    />
  );
}
