import { createId } from "../../domain/ids";
import { nowMs } from "../../domain/time";
import type { TrainingBlockTag, TrainingBlockTagReason } from "../../domain/trainingBlockTag";
import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";

export type CreateTrainingBlockTagInput = {
  exerciseId?: string;
  exerciseName: string;
  startMs: number;
  endMs?: number;
  reason: TrainingBlockTagReason;
  note?: string;
};

/**
 * Creates a training-block tag (adaptive-progression-engine.md §10.3.3) from
 * either creation surface (exercise detail's date-range picker, or session
 * edit's in-the-moment mark) — same underlying record either way, per
 * Martin's decision to support both without splitting into two features.
 */
export async function createTrainingBlockTag(
  input: CreateTrainingBlockTagInput,
  deps: { trainingBlockTagRepo: TrainingBlockTagRepo },
): Promise<TrainingBlockTag> {
  if (input.reason === "other" && !input.note?.trim()) {
    throw new Error('A note is required when the reason is "other".');
  }
  if (input.endMs !== undefined && input.endMs <= input.startMs) {
    throw new Error("endMs must be after startMs.");
  }

  const tag: TrainingBlockTag = {
    id: createId("tbt"),
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    startMs: input.startMs,
    endMs: input.endMs,
    reason: input.reason,
    note: input.note?.trim() || undefined,
    createdAtMs: nowMs(),
  };

  await deps.trainingBlockTagRepo.create(tag);
  return tag;
}
