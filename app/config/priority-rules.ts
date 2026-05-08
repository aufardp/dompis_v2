export const FLAG_PRIORITY = {
  P1: 3,
  'P+': 2,
  FFG: 1,
  GAMAS: 1,
  NONE: 0,
} as const;

export const STATUS_PRIORITY_CONFIG: Record<string, number> = {
  open: 3,
  assigned: 2,
  on_progress: 2,
  in_progress: 2,
  pending: 1,
  cancelled: 0,
  close: -1,
  closed: -1,
};

export const AGE_THRESHOLDS = {
  WARNING_PERCENT: 50,
  CRITICAL_PERCENT: 75,
  BREACH_PERCENT: 100,
} as const;

export const AGE_SEVERITY_HOURS = {
  NORMAL: 8,
  WARNING: 24,
  CRITICAL: 48,
} as const;

export const P_PLUS_ESCALATION_HOURS = 24;
export const BOOKING_DEADLINE_HOURS = 3;
export const GUARANTEE_ESCALATION_HOURS = 3;