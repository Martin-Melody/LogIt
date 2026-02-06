import type { WorkoutSplit, SplitDay } from "$lib/domain/WorkoutSplit";

export function getTodaySplitDay(split: WorkoutSplit): SplitDay | null {
  if (!split.days.length) return null;

  const daysSorted = [...split.days].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  return daysSorted[0] ?? null;
}
