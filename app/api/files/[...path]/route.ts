export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import fsPromises from 'fs/promises';
import path from 'path';

const UPLOADS_BASE = 'public/uploads';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: pathParts } = await params;
    const requestedPath = pathParts.join('/');

    const sanitized = requestedPath.replace(/\\/g, '/');

    const fullPath = path.join(process.cwd(), UPLOADS_BASE, sanitized);
    const baseDir = path.join(process.cwd(), UPLOADS_BASE);

    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(baseDir))) {
      return NextResponse.json(
        { success: false, message: 'Invalid path' },
        { status: 400 },
      );
    }

    try {
      await fsPromises.access(resolved);
    } catch {
      return NextResponse.json(
        { success: false, message: 'File not found' },
        { status: 404 },
      );
    }

    const fileBuffer = await fsPromises.readFile(resolved);
    const mimeType = getMimeType(resolved);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[FILES_API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
