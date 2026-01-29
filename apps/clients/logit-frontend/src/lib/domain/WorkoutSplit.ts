import { createId } from "./ids";
import { nowMs } from "./time";

export type WorkoutSplit = {
  id: string;
  name: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  days: SplitDay[];
}

export type SplitDay = {
  id: string;
  orderIndex: number;
  name?: string;
  exercises: PlannedExercise[];
}

export type PlannedExercise = {
  id: string;
  orderIndex: number;
  exerciseName: string;
  exerciseId?: string; // later form exercise library
  targets?: PlannedTargets;
}

export type PlannedTargets = {
  sets?: number;
  reps?: number;
  weight?: number;
}

type SplitSchedule = {
  id: string;
  splitId: string;
  mapping: Record<string, number>;
}

export function createSplit(name: string = "New Split"): WorkoutSplit {
  const now = nowMs();
  return {
    id: createId("split"),
    name: name.trim() || "New Split",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: [],
  }
}

export function touchSplit(split: WorkoutSplit): WorkoutSplit {
  return { ...split, updatedAtMs: nowMs() };
}

export function renameSplit(split: WorkoutSplit, name: string): WorkoutSplit {
  const nextName = name.trim() || "New Split";
  return touchSplit({ ...split, name: nextName });
}

export function archiveSplit(split: WorkoutSplit, archived = true): workoutspllit {
  return touchSplit({ ...split, archived });
}

export function addDay(split: WorkoutSplit, name?: string): WorkoutSplit {
  const day: SplitDay = {
    id: createId("day"),
    orderIndex: split.days.length,
    name: name?.trim() || undefined,
    exercises: [],
  }

  return touchSplit({
    ...split,
    days: [...split.days, day]
  })

}

export function addPlannedExercise(
  split: WorkoutSplit,
  dayId: string,
  exercise: { exerciseName: string; exerciseId?: string; targets?: PlannedTargets },
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;

  const day = split.days[idx];

  const nextExercise: PlannedExercise = {
    id: createId("pex"),
    orderIndex: day.exercises.length,
    exerciseName: exercise.exerciseName.trim(),
    exerciseId: exercise.exerciseId,
    targets: exercise.targets,
  };

  const nextDay: SplitDay = {
    ...day,
    exercises: [...day.exercises, nextExercise],
  };

  const nextDays = split.days.map((d, i) => (i === idx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}

export function reorderDays(
  split: WorkoutSplit,
  fromIndex: number,
  toIndex: number,
): WorkoutSplit {
  if (fromIndex === toIndex) return split;
  const days = [...split.days];
  const [moved] = days.splice(fromIndex, 1);
  if (!moved) return split;
  days.splice(toIndex, 0, moved);
  const reindexed = days.map((d, i) => ({ ...d, orderIndex: i }));
  return touchSplit({ ...split, days: reindexed });
}

export function reorderPlannedExercises(
  split: WorkoutSplit,
  dayId: string,
  fromIndex: number,
  toIndex: number,
): WorkoutSplit {
  const dayIdx = split.days.findIndex((d) => d.id === dayId);
  if (dayIdx === -1) return split;

  const day = split.days[dayIdx];
  if (fromIndex === toIndex) return split;

  const exs = [...day.exercises];
  const [moved] = exs.splice(fromIndex, 1);
  if (!moved) return split;
  exs.splice(toIndex, 0, moved);

  const reindexed = exs.map((e, i) => ({ ...e, orderIndex: i }));

  const nextDay: SplitDay = { ...day, exercises: reindexed };
  const nextDays = split.days.map((d, i) => (i === dayIdx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}


