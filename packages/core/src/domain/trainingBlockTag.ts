// A general, user-facing mechanism to mark a period of training with a reason —
// injured, deliberately changing tempo, or "just different, no particular
// reason" — so that period doesn't leave an undifferentiated mark on an
// exercise's trend history. See docs/architecture/adaptive-progression-engine.md
// §10.3.3.
//
// Generalizes the pattern the §10.1 rep-range/e1RM confound fix established (a
// per-point "is this comparable to the current regime" flag feeding
// classifyTrend's `comparableToCurrent` parameter) — but derived explicitly by
// the user, for any reason, on any exercise, not just the one case an
// algorithm already tracks automatically. Coexists with the coarser, whole-
// session `WorkoutSession.excludeFromProgression` rather than replacing it.
export type TrainingBlockTagReason =
  | "injury"
  | "tempo-technique-change"
  | "deliberate-variation"
  | "other";

export type TrainingBlockTag = {
  id: string;
  exerciseId?: string;
  exerciseName: string;
  // Inclusive.
  startMs: number;
  // Exclusive; undefined = still in effect ("recovering from shoulder strain,
  // not sure when it ends yet").
  endMs?: number;
  reason: TrainingBlockTagReason;
  // Required when reason is "other" (enforced by the create usecase, not the
  // type); optional elaboration on any other reason too — e.g. "shoulder
  // strain" on "injury".
  note?: string;
  createdAtMs: number;
};

export function isWithinTrainingBlockTag(
  dateMs: number,
  tag: Pick<TrainingBlockTag, "startMs" | "endMs">,
): boolean {
  return dateMs >= tag.startMs && (tag.endMs === undefined || dateMs < tag.endMs);
}

/** True if any tag in the list covers this date — the one predicate both
 * creation surfaces (exercise detail, session edit) and the trend-exclusion
 * logic in getExerciseProgressStory.ts share. */
export function isDateTaggedOut(dateMs: number, tags: TrainingBlockTag[]): boolean {
  return tags.some((t) => isWithinTrainingBlockTag(dateMs, t));
}
