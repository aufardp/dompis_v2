export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { projectSingleTicket } from '@/lib/projection/single';

type ProjectSingleBody = {
  incident?: string;
  ticketRawId?: string;
};

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin']);

    const body = (await req.json().catch(() => ({}))) as ProjectSingleBody;
    const incident = body.incident?.trim();
    const ticketRawId = body.ticketRawId?.trim();

    const identifier = incident || ticketRawId;
    if (!identifier) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Kirim salah satu: { "incident": "INC12345" } atau { "ticketRawId": "uuid" }',
        },
        { status: 400 },
      );
    }

    const result = await projectSingleTicket(identifier);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal memproyeksikan tiket'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
