import { createId } from "./ids";
import { nowMs } from "./time";

export type WorkoutSplit = {
  id: string;
  name: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  days: SplitDay[];
};

export type SplitDay = {
  id: string;
  orderIndex: number;
  name?: string;
  blocks: PlannedBlock[];
};

export type PlannedStrength = {
  type: "strength";
  id: string;
  orderIndex: number;
  exerciseName: string;
  exerciseId?: string;
  targets?: PlannedTargets;
};

export type PlannedCardio = {
  type: "cardio";
  id: string;
  orderIndex: number;
  activityName: string;
};

export type PlannedBlock = PlannedStrength | PlannedCardio;

export type PlannedTargets = {
  sets?: number;
  reps?: number;
  weight?: number;
};

export function createSplit(name: string = "New Split"): WorkoutSplit {
  const now = nowMs();
  return {
    id: createId("split"),
    name: name.trim() || "New Split",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: [],
  };
}

export function touchSplit(split: WorkoutSplit): WorkoutSplit {
  return { ...split, updatedAtMs: nowMs() };
}

export function renameSplit(split: WorkoutSplit, name: string): WorkoutSplit {
  const nextName = name.trim() || "New Split";
  return touchSplit({ ...split, name: nextName });
}

export function archiveSplit(
  split: WorkoutSplit,
  archived = true,
): WorkoutSplit {
  return touchSplit({ ...split, archived });
}

export function addDay(split: WorkoutSplit, name?: string): WorkoutSplit {
  const day: SplitDay = {
    id: createId("day"),
    orderIndex: split.days.length,
    name: name?.trim() || undefined,
    blocks: [],
  };

  return touchSplit({
    ...split,
    days: [...split.days, day],
  });
}

export function addPlannedStrength(
  split: WorkoutSplit,
  dayId: string,
  exercise: {
    exerciseName: string;
    exerciseId?: string;
    targets?: PlannedTargets;
  },
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;

  const day = split.days[idx]!;

  const nextBlock: PlannedStrength = {
    type: "strength",
    id: createId("pex"),
    orderIndex: day.blocks.length,
    exerciseName: exercise.exerciseName.trim(),
    exerciseId: exercise.exerciseId,
    targets: exercise.targets,
  };

  const nextDay: SplitDay = { ...day, blocks: [...day.blocks, nextBlock] };
  const nextDays = split.days.map((d, i) => (i === idx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}

export function addPlannedCardio(
  split: WorkoutSplit,
  dayId: string,
  activityName: string,
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;

  const day = split.days[idx]!;

  const nextBlock: PlannedCardio = {
    type: "cardio",
    id: createId("pcardio"),
    orderIndex: day.blocks.length,
    activityName: activityName.trim(),
  };

  const nextDay: SplitDay = { ...day, blocks: [...day.blocks, nextBlock] };
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

export function reorderPlannedBlocks(
  split: WorkoutSplit,
  dayId: string,
  fromIndex: number,
  toIndex: number,
): WorkoutSplit {
  const dayIdx = split.days.findIndex((d) => d.id === dayId);
  if (dayIdx === -1) return split;

  const day = split.days[dayIdx]!;
  if (fromIndex === toIndex) return split;

  const blocks = [...day.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  if (!moved) return split;
  blocks.splice(toIndex, 0, moved);

  const reindexed = blocks.map((b, i) => ({ ...b, orderIndex: i }));

  const nextDay: SplitDay = { ...day, blocks: reindexed };
  const nextDays = split.days.map((d, i) => (i === dayIdx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}
