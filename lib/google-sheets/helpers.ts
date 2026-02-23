export function nowWIB(): string {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', // WIB (UTC+7)
    // timeZone: 'Asia/Makassar', // WITA (UTC+8)
    // timeZone: 'Asia/Jayapura', // WIT  (UTC+9)
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
