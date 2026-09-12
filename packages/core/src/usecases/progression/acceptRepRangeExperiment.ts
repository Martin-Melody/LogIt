import { getSuggestion } from "./getSuggestion";
import { exerciseKey } from "../../domain/progression";
import { nowMs } from "../../domain/time";
import type { ProgressionDeps } from "./deps";

// Both prefixes are suffixed per-rung by linearProgression.ts (":rung0",
// ":rung1", ...) so dismissing one rung's ask/result never suppresses a later,
// genuinely different rung's — matched here with startsWith, not equality.
const OFFER_NUDGE_PREFIX = "linear-progression:rep-range-trial-offer";
const RESULT_NUDGE_PREFIX = "linear-progression:rep-range-trial-result";

type RepRangeRungShape = {
  trialRepRange: [number, number];
  baselineRepRange: [number, number];
  startedAtMs: number;
  status: "active" | "concluded";
  result?: { switched: boolean };
};

type LinearStateShape = {
  repRange: [number, number];
  // Oldest → newest — see §10.3.1's bounded ladder in linearProgression.ts.
  repRangeLadder?: RepRangeRungShape[];
};

/**
 * Accepts one of the rep-range-experimentation nudges (adaptive-progression-engine.md
 * §10, ladder §10.3.1) — either starting the next rung, or switching permanently once
 * one has won its trial. Bespoke to linear-progression's own state shape, same as the
 * nudges themselves; a generic version is tracked for once this feature has more than
 * one algorithm behind it.
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
  // No persisted row yet is normal, not exceptional — an exercise can go
  // straight from "never saved state" to a nudge the moment it's offered,
  // since getSuggestion seeds state fresh (algorithm.defaultState +
  // history) whenever nothing's been saved. That freshly-seeded state is
  // exactly what produced this nudge, so it's the right base to build the
  // new rung onto — falling back to null here would silently drop the
  // accept for any exercise whose progression state has never been
  // persisted (e.g. trained for months before this algorithm was picked).
  const currentState = (existing?.state as LinearStateShape | null) ?? (output.nextState as LinearStateShape | null);
  if (!currentState) return;

  let nextState: LinearStateShape;

  if (nudgeId.startsWith(OFFER_NUDGE_PREFIX)) {
    const { trialRepRange } = output.nudge.actionData as { trialRepRange: [number, number] };
    const ladder = currentState.repRangeLadder ?? [];
    const newRung: RepRangeRungShape = {
      trialRepRange,
      baselineRepRange: currentState.repRange,
      startedAtMs: nowMs(),
      status: "active",
    };
    nextState = { ...currentState, repRangeLadder: [...ladder, newRung] };
  } else if (nudgeId.startsWith(RESULT_NUDGE_PREFIX)) {
    // Only a WINNING rung's result nudge carries a "Switch" action — the
    // ladder-exhausted give-up message has no actionLabel/actionData for the
    // UI to ever call accept on, so a mismatched last rung is a no-op here.
    const ladder = currentState.repRangeLadder ?? [];
    const lastRung = ladder[ladder.length - 1];
    if (!lastRung?.result?.switched) return;
    nextState = { ...currentState, repRange: lastRung.trialRepRange };
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
    activeExperiment: nudgeId.startsWith(OFFER_NUDGE_PREFIX)
      ? { id: "rep-range-trial", startedAtMs: nextState.repRangeLadder![nextState.repRangeLadder!.length - 1]!.startedAtMs }
      : undefined,
  });
}
