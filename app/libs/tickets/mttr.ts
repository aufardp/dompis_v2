import { parseWIBDateInput } from '@/app/utils/datetime';

/**
 * Rata-rata durasi reported_date -> closed_at (MTTR), dalam detik.
 * Null kalau tidak ada tiket yang bisa dihitung (reported_date tidak
 * ke-parse, atau daftar tiket kosong).
 */
export function computeMttrSeconds(
  tickets: { reportedDate: string | null; closedAt: Date | null }[],
): number | null {
  let totalSeconds = 0;
  let count = 0;

  for (const ticket of tickets) {
    if (!ticket.closedAt) continue;
    const reported = parseWIBDateInput(ticket.reportedDate);
    if (!reported) continue;
    const diffSeconds = (ticket.closedAt.getTime() - reported.getTime()) / 1000;
    if (diffSeconds < 0) continue;
    totalSeconds += diffSeconds;
    count += 1;
  }

  return count > 0 ? totalSeconds / count : null;
}

/** Format detik jadi HH:MM:SS (bisa lebih dari 24 jam, mis. "26:12:03"). */
export function formatMttr(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return '-';
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
