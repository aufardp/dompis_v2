import { notFound } from 'next/navigation';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import TicketDetailContent from '@/app/teknisi/components/TicketDetailContent';
import { protectApi } from '@/app/libs/protectApi';
import { getTicketDetailForActor } from '@/app/libs/services/ticketDetail.service';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ readonly?: string }>;
}

type TicketDetailData = Awaited<ReturnType<typeof getTicketDetailForActor>>;

export default async function TicketDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ticketId = Number(id);
  const readOnly = sp.readonly === '1';

  if (!Number.isFinite(ticketId) || ticketId <= 0) notFound();

  let ticket: TicketDetailData = null;
  try {
    const actor = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'teknisi',
    ]);
    ticket = await getTicketDetailForActor(ticketId, actor, {
      allowGlobalReadOnly: readOnly,
    });
  } catch {
    notFound();
  }

  if (!ticket) notFound();

  const isClosed = isTicketClosed(ticket.status_update);

  return (
    <TicketDetailContent
      ticket={ticket}
      isClosed={isClosed}
      readOnly={ticket.isReadOnlyView}
    />
  );
}
