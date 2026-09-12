import type { TrainingBlockTag } from "../domain/trainingBlockTag";

export interface TrainingBlockTagRepo {
  listForExercise(key: string): Promise<TrainingBlockTag[]>;
  create(tag: TrainingBlockTag): Promise<void>;
  /** Closes an open-ended tag (or otherwise edits one) — same shape as create,
   * just an update rather than an insert. */
  update(tag: TrainingBlockTag): Promise<void>;
  delete(id: string): Promise<void>;
}
