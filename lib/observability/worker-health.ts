export function getMetricAgeMs(timestamp: number | null | undefined): number | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return Math.max(0, Date.now() - timestamp);
}

export function parseProjectionCheckpointMeta(checkpoint: string | null | undefined): {
  neverProjected: number | null;
  oldestPendingAgeMs: number | null;
} {
  if (!checkpoint) {
    return { neverProjected: null, oldestPendingAgeMs: null };
  }

  const neverProjectedMatch = checkpoint.match(/neverProjected=(\d+)/);
  const oldestPendingMatch = checkpoint.match(/oldestPending=([0-9TZ:.\-]+)/);

  const neverProjected = neverProjectedMatch
    ? Number(neverProjectedMatch[1])
    : null;
  const oldestPendingAgeMs = oldestPendingMatch
    ? getMetricAgeMs(Date.parse(oldestPendingMatch[1]))
    : null;

  return {
    neverProjected: Number.isFinite(neverProjected) ? neverProjected : null,
    oldestPendingAgeMs,
  };
}
