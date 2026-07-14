export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketViewers } from '@/app/libs/sseBroadcast';

const VIEWER_TTL_SECONDS = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await protectApi();

    const { id: ticketId } = await params;
    if (!ticketId) {
      return NextResponse.json(
        { ok: false, error: 'Missing ticket id' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const userName = String(body.userName ?? user.role ?? 'Unknown');
    const role = String(body.role ?? user.role ?? 'unknown');

    // Upsert viewer heartbeat
    await prisma.ticket_active_viewers.upsert({
      where: {
        ticket_id_user_id: {
          ticket_id: ticketId,
          user_id: String(user.id_user),
        },
      },
      create: {
        ticket_id: ticketId,
        user_id: String(user.id_user),
        user_name: userName,
        role,
        last_seen_at: new Date(),
      },
      update: {
        user_name: userName,
        role,
        last_seen_at: new Date(),
      },
    });

    // Broadcast current active viewers for this ticket
    const activeViewers = await prisma.ticket_active_viewers.findMany({
      where: {
        ticket_id: ticketId,
        last_seen_at: {
          gte: new Date(Date.now() - VIEWER_TTL_SECONDS * 1000),
        },
      },
      select: {
        user_id: true,
        user_name: true,
        role: true,
      },
    });

    broadcastTicketViewers({
      ticketId,
      viewers: activeViewers.map((v) => ({
        userId: v.user_id,
        userName: v.user_name ?? 'Unknown',
        role: v.role ?? 'unknown',
      })),
      viewerCount: activeViewers.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, 'Heartbeat failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
