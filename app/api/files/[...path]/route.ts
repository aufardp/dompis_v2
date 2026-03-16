export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import nodePath from 'path';

const UPLOADS_ROOT = nodePath.join(process.cwd(), 'public', 'uploads');

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;

    if (!segments?.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const relativePath = segments.join('/');
    const absolutePath = nodePath.resolve(UPLOADS_ROOT, relativePath);

    // ── Path traversal protection ─────────────────────────────────────
    const safeRoot = UPLOADS_ROOT.endsWith(nodePath.sep)
      ? UPLOADS_ROOT
      : UPLOADS_ROOT + nodePath.sep;

    if (!absolutePath.startsWith(safeRoot)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const buffer = await fs.readFile(absolutePath);

    const ext = nodePath.extname(absolutePath).toLowerCase();
    const contentType = MIME_MAP[ext] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    console.error('[/api/files] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
