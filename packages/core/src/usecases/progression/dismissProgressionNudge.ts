import { exerciseKey } from "../../domain/progression";
import { nowMs } from "../../domain/time";
import type { ProgressionDeps } from "./deps";

/**
 * Records that the user dismissed a specific ProgressionNudge for this exercise —
 * available immediately (not gated on finishing a workout), unlike the algorithm's
 * own `state`, which only persists via applySessionProgression at session end.
 * getSuggestion.ts reads this back and suppresses the nudge from then on.
 */
export async function dismissProgressionNudge(
  exercise: { id?: string; name: string },
  nudgeId: string,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  const { progressionRepo } = deps;
  const key = exerciseKey(exercise);

  const [existing, config] = await Promise.all([
    progressionRepo.getExerciseState(key),
    progressionRepo.getConfig(),
  ]);

  const dismissedNudges = Array.from(new Set([...(existing?.dismissedNudges ?? []), nudgeId]));

  await progressionRepo.saveExerciseState({
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    algorithmId: existing?.algorithmId ?? config?.algorithmId ?? "",
    state: existing?.state ?? null,
    updatedAtMs: nowMs(),
    dismissedNudges,
  });
}
