// ==========================================
// Pengganti fetchExternalRows() di lib/status-refresh.ts
// ==========================================
//
// CARA PAKAI:
// 1. Tambahkan import ini di lib/status-refresh.ts:
//      import { fetchExternalRowsViaBridge } from '@/lib/external-db/qosmic-bridge/status-refresh-adapter';
// 2. Ganti pemanggilan `fetchExternalRows(sourceTable, incidents)` (baris ~997)
//    menjadi `fetchExternalRowsViaBridge(sourceTable, incidents)`.
// 3. Fungsi lama `fetchExternalRows` (baris 562-625, yang query MySQL
//    `WHERE incident IN (...)`) BOLEH tetap ada di file (tidak usah dihapus)
//    selama masa transisi — dilindungi feature flag QOSMIC_BRIDGE_ENABLED,
//    lihat di bawah. Ini bukan penggantian permanen sampai Anda yakin bridge
//    stabil di produksi.
//
// PERBEDAAN PERILAKU YANG PERLU DIKETAHUI (bukan bug, tapi trade-off arsitektur):
// - MySQL langsung: SATU query utk N incident sekaligus.
// - Bridge: TIDAK ada batch endpoint — jadi ini melakukan N request terpisah
//   (satu per incident), diatur lewat antrian bounded-concurrency (queue.ts)
//   dan rate limiter global 20/menit (client.ts). Utk STATUS_REFRESH_BATCH_SIZE
//   besar (default 100), ini akan JAUH lebih lambat dari MySQL langsung.
//   => WAJIB turunkan STATUS_REFRESH_BATCH_SIZE (lihat catatan di bagian akhir).
// - worklog_summary / last_update_worklog: field ini dipakai kode existing
//   Anda tapi TIDAK muncul di contoh dokumentasi bridge (yang cuma
//   menunjukkan Incident/Status/Status_Date/Regional/Witel). Kode di bawah
//   tetap mencoba membaca field ini secara graceful (null kalau tidak ada) —
//   TAPI ini perlu diverifikasi manual sekali dengan hit nyata ke bridge
//   utk incident yang Anda tahu punya worklog, supaya yakin field ini
//   memang ikut terbawa atau tidak.

import { fetchByIncident } from './nossa';
import { enqueueBridgeCall } from './queue';
import { isQosmicBridgeConfigured } from './client';
import {
  normalizeExternalRow,
  normalizeStatus,
} from '@/lib/ingestion/normalizer';
import { logger } from '@/lib/observability/logger';
import type {
  ExternalRow,
  NormalizedExternalRow,
} from '@/lib/external-db/types';
import type { ExternalStatusRow } from '@/lib/status-refresh';

function trimTo(value: unknown, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function parseExternalDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function nowWib(): Date {
  return new Date();
}

/**
 * Resource bridge cuma 'nossa' | 'nossa_closed'. `sourceTable` di kode Anda
 * seharusnya sudah bernilai persis salah satu dari dua ini (nama tabel
 * EXTERNAL_TABLE_NAMES) — kalau ternyata beda (mis. ada alias lain),
 * sesuaikan mapping di sini.
 */
function toResource(sourceTable: string): 'nossa' | 'nossa_closed' {
  if (sourceTable === 'nossa' || sourceTable === 'nossa_closed')
    return sourceTable;
  throw new Error(
    `[QosmicBridge] sourceTable tidak dikenal: "${sourceTable}" — harus "nossa" atau "nossa_closed"`,
  );
}

/**
 * Drop-in replacement utk fetchExternalRows() versi MySQL. Signature dan
 * bentuk return SAMA PERSIS supaya caller di status-refresh.ts tidak perlu
 * diubah.
 */
export async function fetchExternalRowsViaBridge(
  sourceTable: string,
  incidents: string[],
): Promise<Map<string, ExternalStatusRow>> {
  const mapped = new Map<string, ExternalStatusRow>();
  if (incidents.length === 0) return mapped;

  if (!isQosmicBridgeConfigured()) {
    logger.error(
      '[QosmicBridge] Belum dikonfigurasi (QOSMIC_BRIDGE_BASE_URL/TOKEN kosong) — status-refresh dilewati utk batch ini',
      {
        sourceTable,
        incidentCount: incidents.length,
      },
    );
    return mapped;
  }

  const resource = toResource(sourceTable);
  const otherResource = resource === 'nossa' ? 'nossa_closed' : 'nossa';

  const fetchWithFallback = async (incident: string): Promise<{ row: Record<string, unknown> | null; sourceTable: string }> => {
    const row = await enqueueBridgeCall(
      () => fetchByIncident<Record<string, unknown>>(resource, incident),
      'background',
    );
    if (row) return { row, sourceTable: resource };

    const fallbackRow = await enqueueBridgeCall(
      () => fetchByIncident<Record<string, unknown>>(otherResource, incident),
      'background',
    );
    if (fallbackRow) return { row: fallbackRow, sourceTable: otherResource };

    return { row: null, sourceTable: resource };
  };

  const results = await Promise.allSettled(
    incidents.map((incident) => fetchWithFallback(incident)),
  );

  let notFound = 0;
  let failed = 0;
  let fallbackUsed = 0;

  results.forEach((result, index) => {
    const incident = incidents[index];

    if (result.status === 'rejected') {
      failed++;
      logger.warn(
        '[QosmicBridge] fetchByIncident gagal, dilewati (akan dicoba lagi run berikutnya)',
        {
          sourceTable,
          incident,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
      );
      return;
    }

    const { row: rawRow, sourceTable: foundIn } = result.value;
    if (!rawRow) {
      notFound++;
      return;
    }

    if (foundIn !== resource) fallbackUsed++;

    const normalized = normalizeExternalRow(
      rawRow as unknown as ExternalRow,
      foundIn,
    ) as NormalizedExternalRow;

    const normalizedIncident = trimTo(normalized.incident, 50);
    if (!normalizedIncident) return;

    mapped.set(normalizedIncident, {
      incident: normalizedIncident,
      sourceTable: foundIn,
      normalizedStatus: normalizeStatus(
        trimTo(normalized.status, 50) ?? undefined,
      ),
      statusDate: trimTo(normalized.status_date, 100),
      dateModified: trimTo(normalized.date_modified, 50),
      worklogSummary: trimTo(normalized.worklog_summary, 100),
      lastUpdateWorklog: trimTo(normalized.last_update_worklog, 100),
      sourceUpdatedAt: parseExternalDate(normalized.date_modified) ?? nowWib(),
      resolveDate: parseExternalDate(normalized.resolve_date) ?? null,
      technician: trimTo(normalized.technician, 255),
    });
  });

  logger.info('[QosmicBridge] Batch status-refresh selesai', {
    sourceTable,
    requested: incidents.length,
    found: mapped.size,
    notFound,
    failed,
    fallbackUsed,
  });

  return mapped;
}
