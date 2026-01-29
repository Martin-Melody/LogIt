import { getSplitRepo } from "$lib/data/repoProvider";
import { addPlannedExercise as addPlannedExerciseDomain } from "$lib/domain/WorkoutSplit";

export async function addPlannedExercise(
  splitId: string,
  dayId: string,
  exerciseName: string,
  targets?: { sets?: number; reps?: number; weight?: number },
): Promise<void> {
  const repo = getSplitRepo();
  const split = await repo.getSplit(splitId);
  if (!split) throw new Error("Split not found");

  const next = addPlannedExerciseDomain(split, dayId, {
    exerciseName,
    targets,
  });

  await repo.saveSplit(next);
}

