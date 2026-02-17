import { NextRequest, NextResponse } from 'next/server';
import db from '@/app/libs/db';
import { saveFiles } from '@/app/libs/upload';
import { protectApi } from '@/app/libs/protectApi';

export async function POST(req: NextRequest) {
  try {
    await protectApi(['teknisi', 'admin', 'helpdesk', 'superadmin']);

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const incident = formData.get('incident') as string;
    const ticketId = Number(formData.get('ticketId'));

    if (!files.length || !incident || !ticketId) {
      return NextResponse.json(
        { success: false, message: 'Data tidak lengkap' },
        { status: 400 },
      );
    }

    const savedFiles = await saveFiles(files, incident);

    for (const file of savedFiles) {
      await db.execute(
        `INSERT INTO ticket_evidence 
         (ticket_id, incident, file_name, file_path, file_size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          ticketId,
          incident,
          file.fileName,
          file.filePath,
          file.fileSize,
          file.mimeType,
        ],
      );
    }

    return NextResponse.json({
      success: true,
      files: savedFiles,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: 'Upload gagal' },
      { status: 500 },
    );
  }
}
