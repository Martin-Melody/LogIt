import type { ExercisePatch } from "@logit/core/domain/exercise";
import { getExerciseRepo, getSplitRepo } from "$lib/data/repoProvider";
import { pushExercise } from "$lib/sync/syncService";

/**
 * Updates an exercise and propagates the new name to any split blocks that
 * reference it by exerciseId.
 */
export async function updateExercise(id: string, patch: ExercisePatch): Promise<void> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();

  const updated = await exerciseRepo.update(id, patch);
  pushExercise(updated);

  if (!patch.name) return;

  // getListSplits() is a lightweight index for list screens — it hardcodes every day's
  // blocks to [] rather than querying them (see splitRepo.sqlite.ts), so iterating its
  // result here never actually found a matching block: this rename never propagated to any
  // split, silently. Look up the id list, then fetch each split's real data via getSplit().
  const stubs = await splitRepo.getListSplits({ limit: 200 });
  const splits = (await Promise.all(stubs.map((s) => splitRepo.getSplit(s.id)))).filter(
    (s): s is NonNullable<typeof s> => s !== null,
  );
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
