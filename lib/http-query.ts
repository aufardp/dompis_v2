export function toPositiveInt(
  value: string | null,
  fallback: number,
  max?: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const normalized = Math.floor(n);
  return typeof max === 'number' ? Math.min(normalized, max) : normalized;
}

export function toSortOrder(
  value: string | null,
  fallback: 'asc' | 'desc' = 'desc',
): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

export function toEnumValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export function toBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function toBoundedString(
  value: string | null,
  maxLength: number,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
