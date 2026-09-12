import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";

/** Removes a mis-tagged training block entirely. */
export async function deleteTrainingBlockTag(
  tagId: string,
  deps: { trainingBlockTagRepo: TrainingBlockTagRepo },
): Promise<void> {
  await deps.trainingBlockTagRepo.delete(tagId);
}
