const STATUS_PRIORITY: Record<string, number> = {
  'CLOSED': 4,
  'CLOSE': 4,
  'PENDING': 3,
  'OPEN': 2,
  'UNKNOWN': 1,
  'NULL': 0,
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
  reason: 'new_record' | 'hash_changed' | 'status_conflict' | 'no_change';
}

export function resolveConflict(
  existingRecord: {
    sourceHash: string | null;
    status: string | null;
    syncVersion: number;
  } | null,
  newHash: string,
  newStatus: string
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