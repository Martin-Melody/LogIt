import { nowMs } from "../../domain/time";
import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";

/**
 * Closes an open-ended training-block tag ("recovering from shoulder strain,
 * not sure when it ends yet") once the user knows it's over — defaults to
 * now, or an explicit past endMs if they're backfilling. No-op if the tag is
 * already closed or doesn't exist, rather than erroring on a stale UI state.
 */
export async function closeTrainingBlockTag(
  key: string,
  tagId: string,
  deps: { trainingBlockTagRepo: TrainingBlockTagRepo },
  endMs: number = nowMs(),
): Promise<void> {
  const tags = await deps.trainingBlockTagRepo.listForExercise(key);
  const tag = tags.find((t) => t.id === tagId);
  if (!tag || tag.endMs !== undefined) return;
  await deps.trainingBlockTagRepo.update({ ...tag, endMs });
}
