import fsPromises from 'fs/promises';
import path from 'path';

export type ActionType = 'pending' | 'close';

/**
 * Saves uploaded evidence files to local storage.
 * Path structure: public/uploads/evidence/{incident}/{fileName}
 * Accessible via: /uploads/evidence/{incident}/{fileName}
 */
export async function saveFiles(
  files: File[],
  incident: string,
  actionType: ActionType = 'pending',
) {
  // Save to public/uploads for Next.js static file serving
  const uploadDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'evidence',
    incident,
  );

  // Async mkdir (non-blocking)
  await fsPromises.mkdir(uploadDir, { recursive: true });

  // Process all files in PARALLEL with Promise.all
  const savedFiles = await Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = path.extname(file.name);
      const baseName = path
        .basename(file.name, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = Date.now();
      const newName = `${actionType}_${baseName}_${timestamp}${ext}`;

      const filePath = path.join(uploadDir, newName);

      // Async writeFile — does not block event loop
      await fsPromises.writeFile(filePath, buffer);

      return {
        fileName: newName,
        filePath: `uploads/evidence/${incident}/${newName}`,
        fileSize: file.size,
        mimeType: file.type,
      };
    }),
  );

  return savedFiles;
}
