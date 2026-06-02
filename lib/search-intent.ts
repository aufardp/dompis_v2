export type SearchType = 'ticket_code' | 'service' | 'contact';

export function normalizeSearchInput(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

export function detectSearchType(
  value: string | undefined | null,
): SearchType | undefined {
  const term = normalizeSearchInput(value);
  if (!term) return undefined;

  const compactNumber = term.replace(/[^\d]/g, '');
  const isNumericLike = /^[\d\s+().-]+$/.test(term);
  if (isNumericLike && compactNumber.length >= 4) {
    return 'service';
  }

  const isTicketCodeLike = /^[a-z0-9_-]{3,}$/i.test(term) && !term.includes(' ');
  if (isTicketCodeLike) {
    return 'ticket_code';
  }

  return 'contact';
}

export function parseSearchType(
  value: string | undefined | null,
): SearchType | undefined {
  if (value === 'ticket_code' || value === 'service' || value === 'contact') {
    return value;
  }
  return undefined;
}
