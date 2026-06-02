const STATUS_PRIORITY: Record<string, number> = {
  CLOSED: 90,
  CLOSE: 90,
  FINALCHECK: 80,
  MEDIACARE: 70,
  BACKEND: 60,
  ANALYSIS: 50,
  PENDING: 40,
  OPEN: 30,
  DRAFT: 20,
  UNKNOWN: 10,
  NULL: 0,
};

export function resolveStatusConflict(existing: string | null, incoming: string | null): string {
  const existingKey = existing?.toUpperCase() ?? 'NULL';
  const incomingKey = incoming?.toUpperCase() ?? 'NULL';

  const existingPriority = STATUS_PRIORITY[existingKey] ?? 0;
  const incomingPriority = STATUS_PRIORITY[incomingKey] ?? 0;

  return incomingPriority >= existingPriority ? (incoming || 'UNKNOWN') : (existing || 'UNKNOWN');
}

export function shouldUpdateRecord(
  existingHash: string | null,
  newHash: string,
  existingStatus: string | null,
  newStatus: string
): boolean {
  if (!existingHash) return true;

  if (existingHash === newHash) {
    return false;
  }

  return true;
}

export interface ConflictResolutionResult {
  shouldInsert: boolean;
  shouldUpdate: boolean;
  newStatus: string;
  newVersion: number;
  reason:
    | 'new_record'
    | 'hash_changed'
    | 'status_conflict'
    | 'stale_source'
    | 'no_change';
}

export function resolveConflict(
  existingRecord: {
    sourceHash: string | null;
    status: string | null;
    syncVersion: number;
    sourceUpdatedAt?: Date | null;
  } | null,
  newHash: string,
  newStatus: string,
  incomingSourceUpdatedAt?: Date | null,
): ConflictResolutionResult {
  if (!existingRecord) {
    return {
      shouldInsert: true,
      shouldUpdate: false,
      newStatus: newStatus || 'UNKNOWN',
      newVersion: 1,
      reason: 'new_record',
    };
  }

  if (
    existingRecord.sourceUpdatedAt &&
    incomingSourceUpdatedAt &&
    incomingSourceUpdatedAt.getTime() < existingRecord.sourceUpdatedAt.getTime()
  ) {
    return {
      shouldInsert: false,
      shouldUpdate: false,
      newStatus: existingRecord.status || 'UNKNOWN',
      newVersion: existingRecord.syncVersion,
      reason: 'stale_source',
    };
  }

  if (existingRecord.sourceHash === newHash) {
    return {
      shouldInsert: false,
      shouldUpdate: false,
      newStatus: existingRecord.status || 'UNKNOWN',
      newVersion: existingRecord.syncVersion,
      reason: 'no_change',
    };
  }

  const resolvedStatus = resolveStatusConflict(existingRecord.status, newStatus);

  return {
    shouldInsert: false,
    shouldUpdate: true,
    newStatus: resolvedStatus,
    newVersion: existingRecord.syncVersion + 1,
    reason: existingRecord.sourceHash !== newHash ? 'hash_changed' : 'status_conflict',
  };
}
