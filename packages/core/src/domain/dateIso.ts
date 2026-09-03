/**
 * Timezone-safe date math on `YYYY-MM-DD` strings — anchored to midnight UTC so
 * arithmetic never drifts across a DST boundary or the user's local offset.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return utcMsToIso(isoToUtcMs(iso) + n * DAY_MS);
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((isoToUtcMs(bIso) - isoToUtcMs(aIso)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return new Date(isoToUtcMs(iso)).getUTCDay();
}

/** The Monday (or Sunday, if `mondayStart` is false) on or before `iso`. */
export function weekStartIso(iso: string, mondayStart = true): string {
  const dow = dayOfWeek(iso);
  const back = mondayStart ? (dow + 6) % 7 : dow;
  return addDays(iso, -back);
}
