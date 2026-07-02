import { notFound } from 'next/navigation';
import { fetchWithAuthServer } from '@/app/libs/fetcher-server';
import type { Ticket } from '@/app/types/ticket';
import { headers } from 'next/headers';
import EvidenceUploadPage from '@/app/teknisi/components/EvidenceUploadPage';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EvidencePage({ params }: Props) {
  const { id } = await params;
  const ticketId = Number(id);

  if (!Number.isFinite(ticketId) || ticketId <= 0) notFound();

  const cookieHeader = (await headers()).get('cookie') ?? '';

  let ticket: Ticket | null = null;
  try {
    const res = await fetchWithAuthServer(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tickets/${ticketId}/detail`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) throw new Error('Failed to fetch');

    const json = await res.json();
    ticket = json?.data ?? null;
  } catch {
    notFound();
  }

  if (!ticket) notFound();

  return <EvidenceUploadPage ticket={ticket} />;
}
