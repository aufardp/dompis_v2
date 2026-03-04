import { Prisma } from '@prisma/client';
import { TechEventEvidence } from '@/app/libs/integrations/techEventTypes';

/**
 * Builds evidence metadata for tech event payloads.
 * 
 * Queries ticket_evidence table and transforms rows into TechEventEvidence format.
 * The local_path is generated as /data/uploads/evidence/{incident}/{file_name}
 * to enable n8n filesystem access via shared volume mount.
 * 
 * @param incident - The incident identifier (e.g., "INC-2025-001")
 * @param tx - Optional Prisma transaction client
 * @returns TechEventEvidence if evidence exists, null otherwise
 */
export async function buildTechEventEvidence(
  incident: string,
  tx?: Prisma.TransactionClient,
): Promise<TechEventEvidence | null> {
  const db = tx ?? (await import('@/app/libs/prisma')).default;

  const evidence = await db.ticket_evidence.findMany({
    where: { incident },
    orderBy: { id: 'asc' },
    select: {
      file_name: true,
      file_path: true,
      n8n_web_url: true,
    },
  });

  if (evidence.length === 0) {
    return null;
  }

  return {
    count: evidence.length,
    files: evidence.map((e) => ({
      file_name: e.file_name,
      local_path: `/data/uploads/${e.file_path}`,
      drive_url: e.n8n_web_url ?? null,
    })),
  };
}
