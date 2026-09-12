export function nowMs(): number {
  return Date.now();
}

export function durationMs(startAtMs: number, endedAt: number): number {
  return Math.max(0, endedAt - startAtMs);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
// 1970-01-05T00:00:00Z was a Monday — anchoring here aligns buckets to Mon–Sun
// calendar weeks (in UTC; good enough for relative week-over-week grouping,
// not meant for display of "which week" to a user in their own timezone).
const MONDAY_EPOCH_ANCHOR_MS = 4 * MS_PER_DAY;

/** A stable, Monday-aligned week bucket index for grouping timestamps by calendar week. */
export function weekBucket(ms: number): number {
  return Math.floor((ms - MONDAY_EPOCH_ANCHOR_MS) / MS_PER_WEEK);
}
