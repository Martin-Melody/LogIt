import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";

export type TodayPlan = {
  dayNumber: number;
  dayName?: string;
  exercises: { id: string; name: string }[];
};

export function getTodayPlanFromSplit(split: WorkoutSplit): TodayPlan | null {
  if (!split.days.length) return null;

  const daysSorted = [...split.days].sort((a, b) => a.orderIndex - b.orderIndex);
  const day = daysSorted[0]; // MVP: "today" = first day

  return {
    dayNumber: day.orderIndex + 1,
    dayName: day.name,
    exercises: day.exercises
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({ id: e.id, name: e.exerciseName })),
  };
}

