import { getSuggestion } from "./getSuggestion";
import { exerciseKey } from "../../domain/progression";
import { nowMs } from "../../domain/time";
import type { ProgressionDeps } from "./deps";

const OFFER_NUDGE_ID = "linear-progression:rep-range-trial-offer";
const RESULT_NUDGE_ID = "linear-progression:rep-range-trial-result";

type LinearStateShape = {
  repRange: [number, number];
  repRangeTrial?: {
    trialRepRange: [number, number];
    baselineRepRange: [number, number];
    startedAtMs: number;
    status: "active" | "concluded";
  };
};

/**
 * Accepts one of the rep-range-experimentation nudges (adaptive-progression-engine.md
 * §10) — either starting a trial, or switching permanently once one has concluded in
 * the trial's favour. Bespoke to linear-progression's own state shape, same as the
 * nudges themselves; a generic version is tracked for once this feature has more
 * than one algorithm behind it.
 *
 * Re-fetches the current suggestion rather than trusting whatever the UI first
 * rendered, in case history moved on since — if the nudge isn't there any more (or
 * isn't the one being accepted), this is a no-op rather than acting on stale data.
 */
export async function acceptRepRangeExperiment(
  exercise: { id?: string; name: string },
  nudgeId: string,
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo">,
): Promise<void> {
  const { progressionRepo } = deps;
  const key = exerciseKey(exercise);

  const output = await getSuggestion(exercise, deps);
  if (!output?.nudge || output.nudge.id !== nudgeId) return;

  const existing = await progressionRepo.getExerciseState(key);
  const currentState = (existing?.state as LinearStateShape | null) ?? null;
  if (!currentState) return; // both nudges require existing history/state to have been offered at all

  let nextState: LinearStateShape;

  if (nudgeId === OFFER_NUDGE_ID) {
    const { trialRepRange } = output.nudge.actionData as { trialRepRange: [number, number] };
    nextState = {
      ...currentState,
      repRangeTrial: {
        trialRepRange,
        baselineRepRange: currentState.repRange,
        startedAtMs: nowMs(),
        status: "active",
      },
    };
  } else if (nudgeId === RESULT_NUDGE_ID) {
    if (!currentState.repRangeTrial) return;
    nextState = {
      ...currentState,
      repRange: currentState.repRangeTrial.trialRepRange,
    };
  } else {
    return;
  }

  await progressionRepo.saveExerciseState({
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    algorithmId: existing?.algorithmId ?? "linear-progression",
    state: nextState,
    updatedAtMs: nowMs(),
    dismissedNudges: existing?.dismissedNudges,
    activeExperiment:
      nudgeId === OFFER_NUDGE_ID
        ? { id: "rep-range-trial", startedAtMs: nextState.repRangeTrial!.startedAtMs }
        : undefined,
  });
}
