export interface TimeSlot {
  start: string;
  end: string;
}

export const SPOILED_SLOTS: TimeSlot[] = [
  { start: '09:00', end: '12:00' },
  { start: '11:00', end: '14:00' },
  { start: '13:00', end: '16:00' },
  { start: '13:00', end: '18:00' },
];

export function extractTimeFromDate(
  dateString: string | null | undefined,
): string | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return null;
  }
}

export function isSpoiledTimeSlot(time: string | null): boolean {
  if (!time) return false;

  const [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return false;

  const timeInMinutes = hours * 60 + minutes;

  return SPOILED_SLOTS.some((slot) => {
    const [startHour, startMin] = slot.start.split(':').map(Number);
    const [endHour, endMin] = slot.end.split(':').map(Number);

    const slotStart = startHour * 60 + startMin;
    const slotEnd = endHour * 60 + endMin;

    return timeInMinutes >= slotStart && timeInMinutes < slotEnd;
  });
}

export function add3Hours(
  dateString: string | null | undefined,
): string | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    date.setHours(date.getHours() + 3);

    return date.toISOString();
  } catch {
    return null;
  }
}

export function formatDateForDisplay(dateString: string | null): string {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
