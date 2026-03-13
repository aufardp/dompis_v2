export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { toISODateString } from '@/app/utils/datetime';

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { id } = await params;
    const ticketId = toPositiveInt(id);
    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'Invalid ticket id' },
        { status: 400 },
      );
    }

    // Minimal access guard: teknisi can only view their own ticket evidence
    if (String(user.role).toLowerCase() === 'teknisi') {
      const ticket = await prisma.ticket.findUnique({
        where: { id_ticket: ticketId },
        select: { teknisi_user_id: true },
      });

      if (!ticket) {
        return NextResponse.json(
          { success: false, message: 'Ticket not found' },
          { status: 404 },
        );
      }

      if (ticket.teknisi_user_id !== user.id_user) {
        return NextResponse.json(
          { success: false, message: 'Forbidden - Access denied' },
          { status: 403 },
        );
      }
    }

    const rows = await prisma.ticket_evidence.findMany({
      where: { ticket_id: ticketId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        file_name: true,
        file_path: true,
        file_size: true,
        mime_type: true,
        n8n_web_url: true,
        created_at: true,
      },
    });

    const data = rows.map((r) => {
      // Normalise path lama (dengan /public prefix) dan path baru
      const cleanPath = r.file_path
        .replace(/^\/public\//, '/')   // /public/uploads/... → /uploads/...
        .replace(/^uploads\//, '/uploads/');  // uploads/... → /uploads/...
      
      return {
        id: r.id,
        fileName: r.file_name,
        filePath: r.file_path,
        url: cleanPath,
        driveUrl: r.n8n_web_url ?? null,
        fileSize: r.file_size ?? null,
        mimeType: r.mime_type ?? null,
        createdAt: toISODateString(r.created_at),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to fetch evidence');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
