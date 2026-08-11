import fsPromises from 'fs/promises';
import nodePath from 'path';

const KML_STORAGE_ROOT = nodePath.join(process.cwd(), 'public', 'uploads', 'kml-layers');

export function kmlStorageDir() {
  return KML_STORAGE_ROOT;
}

export function kmlStoragePath(layerId: number): string {
  return nodePath.join(KML_STORAGE_ROOT, `${layerId}.kml`);
}

export async function saveKmlFile(layerId: number, xmlText: string) {
  await fsPromises.mkdir(KML_STORAGE_ROOT, { recursive: true });
  const target = kmlStoragePath(layerId);
  await fsPromises.writeFile(target, xmlText, 'utf8');
  return target;
}

export async function deleteKmlFile(layerId: number) {
  try {
    await fsPromises.unlink(kmlStoragePath(layerId));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
