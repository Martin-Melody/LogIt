import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";

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
    exercises: day.blocks
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((b) => b.type === "strength")
      .map((b) => ({ id: b.id, name: b.type === "strength" ? b.exerciseName : "" })),
  };
}

