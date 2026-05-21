/**
 * Flagging Manja — Dynamic Compute Helper
 *
 * Resolves effective flagging status at query/render time.
 * Handles auto-promote: P+ → P1 when booking_date is today or past.
 *
 * Rules:
 * - booking_date = today AND hour <= 15:00 WIB → P1
 * - booking_date = today AND hour > 15:00 WIB → P+ (auto-promotes to P1 at midnight)
 * - booking_date = future → P+
 * - booking_date = past → P1 (already overdue)
 */

export function computeFlaggingManja(bookingDate: string | null): string | null {
  if (!bookingDate) return null;

  const booking = new Date(bookingDate);
  if (isNaN(booking.getTime())) return null;

  const now = new Date();
  const bookingDateStr = booking.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const wibHour = booking.getUTCHours() + 7;

  if (bookingDateStr === todayStr && wibHour <= 15) {
    return 'P1';
  }

  if (bookingDateStr < todayStr) {
    return 'P1';
  }

  return 'P+';
}

/**
 * Resolve effective flagging at query/render time.
 * Auto-promotes P+ → P1 when booking_date is today or past.
 */
export function resolveEffectiveFlagging(
  storedFlagging: string | null,
  bookingDate: string | null,
): string | null {
  if (!bookingDate) return storedFlagging;

  const booking = new Date(bookingDate);
  if (isNaN(booking.getTime())) return storedFlagging;

  const now = new Date();
  const bookingDateStr = booking.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  // Auto-promote: P+ → P1 if booking_date is today or past
  if (storedFlagging === 'P+' && bookingDateStr <= todayStr) {
    return 'P1';
  }

  return storedFlagging;
}
