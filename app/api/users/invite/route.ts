import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createHash } from 'crypto';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { INVITE_CONFIG } from '@/app/config/invite';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await protectApi(['teknisi']);
  const body = await req.json();
  const { ticketId, incident } = body;

  if (!ticketId || !incident) {
    return NextResponse.json(
      { success: false, message: 'ticketId dan incident wajib diisi' },
      { status: 400 },
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id_ticket: Number(ticketId) },
    select: { id_ticket: true, incident: true, teknisi_user_id: true },
  });

  if (!ticket) {
    return NextResponse.json(
      { success: false, message: 'Ticket tidak ditemukan' },
      { status: 404 },
    );
  }

  if (ticket.teknisi_user_id !== actor.id_user) {
    return NextResponse.json(
      { success: false, message: 'Anda belum ditugaskan di tiket ini' },
      { status: 403 },
    );
  }

  const existingInvite = await prisma.invite_token.findFirst({
    where: {
      ticket_id: Number(ticketId),
      expires_at: { gt: new Date() },
    },
  });

  if (existingInvite) {
    return NextResponse.json(
      { success: false, message: 'Invite sudah aktif, tunggu expire atau generate ulang' },
      { status: 409 },
    );
  }

  const existingTeam = await prisma.ticket_team.findFirst({
    where: { ticket_id: Number(ticketId) },
  });

  if (existingTeam && existingTeam.registered_user_id !== null) {
    return NextResponse.json(
      { success: false, message: 'Tim sudah lengkap (2 orang)' },
      { status: 409 },
    );
  }

  const ttlSeconds = INVITE_CONFIG.teknisiInviteTtlSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const token = await new SignJWT({
    type: INVITE_CONFIG.tokenType,
    role: 'teknisi',
    ticketId: Number(ticketId),
    incident: String(incident),
    teknisi_user_id: actor.id_user,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

  const tokenHash = createHash('sha256').update(token).digest('hex');

  await prisma.invite_token.create({
    data: {
      token_hash: tokenHash,
      role: 'teknisi',
      created_by: actor.id_user,
      expires_at: expiresAt,
      ticket_id: Number(ticketId),
      incident: String(incident),
      teknisi_user_id: actor.id_user,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000';
  return NextResponse.json({
    success: true,
    data: {
      token,
      qrUrl: `${baseUrl}/teknisi/join?token=${token}`,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds,
    },
  });
}