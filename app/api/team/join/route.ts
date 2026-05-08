import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createHash } from 'crypto';
import prisma from '@/app/libs/prisma';
import { INVITE_CONFIG } from '@/app/config/invite';
import { protectApi } from '@/app/libs/protectApi';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await protectApi(['teknisi']);
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Token wajib diisi' },
      { status: 400 },
    );
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  let payload: any;

  try {
    const result = await jwtVerify(token, secret);
    payload = result.payload;
    if (payload.type !== INVITE_CONFIG.tokenType) {
      throw new Error('Invalid token type');
    }
  } catch {
    return NextResponse.json(
      { success: false, message: 'QR tidak valid atau sudah expired' },
      { status: 400 },
    );
  }

  const { ticketId, incident, teknisi_user_id } = payload;

  if (!ticketId || !incident || !teknisi_user_id) {
    return NextResponse.json(
      { success: false, message: 'Data invite tidak lengkap' },
      { status: 400 },
    );
  }

  if (actor.id_user === teknisi_user_id) {
    return NextResponse.json(
      { success: false, message: 'Anda tidak bisa join tim sendiri' },
      { status: 400 },
    );
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const inviteRecord = await prisma.invite_token.findUnique({
    where: { token_hash: tokenHash },
  });

  if (!inviteRecord) {
    return NextResponse.json(
      { success: false, message: 'Invite tidak ditemukan' },
      { status: 404 },
    );
  }

  if (inviteRecord.used_by !== null) {
    return NextResponse.json(
      { success: false, message: 'Invite sudah digunakan' },
      { status: 400 },
    );
  }

  if (inviteRecord.expires_at < new Date()) {
    return NextResponse.json(
      { success: false, message: 'QR sudah expired' },
      { status: 400 },
    );
  }

  const existingTeam = await prisma.ticket_team.findFirst({
    where: { ticket_id: Number(ticketId) },
  });

  if (existingTeam && existingTeam.registered_user_id !== null) {
    return NextResponse.json(
      { success: false, message: 'Tim sudah lengkap' },
      { status: 400 },
    );
  }

  const updatedInvite = await prisma.invite_token.update({
    where: { token_hash: tokenHash },
    data: { used_by: actor.id_user, used_at: new Date() },
  });

  await prisma.ticket_team.create({
    data: {
      ticket_id: Number(ticketId),
      incident: String(incident),
      invited_by: Number(teknisi_user_id),
      registered_user_id: actor.id_user,
      registered_at: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      message: `Berhasil join tim! Ticket: ${incident}`,
      ticketId,
      incident,
      invitedBy: teknisi_user_id,
    },
  });
}