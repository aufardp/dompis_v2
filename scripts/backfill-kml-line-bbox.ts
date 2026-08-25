import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { computePathBbox } from '@/app/libs/kml/geo';
import type { Prisma } from '@prisma/client';

async function main() {
  console.log('[Backfill] Starting kml_feature line bbox backfill...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    let lastId = 0;

    while (true) {
      const rows = await prisma.kml_feature.findMany({
        where: {
          feature_type: 'line',
          path_min_lat: null,
          id: { gt: lastId },
        },
        select: { id: true, path_coordinates: true },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (rows.length === 0) break;

      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];

      for (const row of rows) {
        const bbox = computePathBbox(
          row.path_coordinates as [number, number][] | null,
        );
        if (bbox) {
          updates.push(
            prisma.kml_feature.updateMany({
              where: { id: row.id },
              data: {
                path_min_lat: bbox.minLat,
                path_max_lat: bbox.maxLat,
                path_min_lng: bbox.minLng,
                path_max_lng: bbox.maxLng,
              },
            }),
          );
          updated++;
        } else {
          skipped++;
        }
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      checked += rows.length;
      lastId = rows[rows.length - 1].id;

      console.log(
        `[Backfill] Progress: ${checked} checked, ${updated} updated, ${skipped} skipped (last id ${lastId})`,
      );
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Checked: ${checked}`);
    console.log(`Updated (bbox computed): ${updated}`);
    console.log(`Skipped (no path_coordinates): ${skipped}`);
    console.log('========================\n');
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('[Backfill] Done');
    process.exit(0);
  }
}

main();
