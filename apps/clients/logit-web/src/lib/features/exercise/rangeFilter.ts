// Full exercise history has no backend windowing (getExerciseHistory fetches
// everything) — for an account with a year+ of data that's a lot of points to
// cram into one chart. This is a client-side display filter only, not a
// re-fetch: desktop has room to show "all", but a shorter window is often
// more readable.
export type RangeMonths = 3 | 6 | 12 | null; // null = all

export const RANGE_OPTIONS: { label: string; value: RangeMonths }[] = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "1Y", value: 12 },
  { label: "All", value: null },
];

export function filterByRangeMonths<T extends { date: Date }>(points: T[], months: RangeMonths): T[] {
  if (months === null || points.length === 0) return points;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return points.filter((p) => p.date >= cutoff);
}
