import { notFound } from 'next/navigation';
import type { Ticket } from '@/app/types/ticket';
import EvidenceUploadPage from '@/app/teknisi/components/EvidenceUploadPage';
import { protectApi } from '@/app/libs/protectApi';
import { getTicketDetailForActor } from '@/app/libs/services/ticketDetail.service';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EvidencePage({ params }: Props) {
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

  return <EvidenceUploadPage ticket={ticket} />;
}
