import type { ExercisePatch } from "$lib/domain/exercise";
import { getExerciseRepo, getSplitRepo } from "$lib/data/repoProvider";

/**
 * Updates an exercise and propagates the new name to any split blocks that
 * reference it by exerciseId.
 */
export async function updateExercise(id: string, patch: ExercisePatch): Promise<void> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();

  const updated = await exerciseRepo.update(id, patch);

  if (!patch.name) return;

  const splits = await splitRepo.getListSplits({ limit: 200 });
  for (const split of splits) {
    let changed = false;
    const days = split.days.map((day) => {
      const blocks = day.blocks.map((block) => {
        if (block.type === "strength" && block.exerciseId === id && block.exerciseName !== updated.name) {
          changed = true;
          return { ...block, exerciseName: updated.name };
        }
        return block;
      });
      return { ...day, blocks };
    });
    if (changed) {
      await splitRepo.saveSplit({ ...split, days });
    }
  }
}
