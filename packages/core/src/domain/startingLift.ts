import type { ExerciseHistoryEntry } from "./progression";
import { estimated1RM } from "./oneRepMax";

/**
 * A best lift typed in during onboarding ("Your best lifts"): a recent heavy set or a max.
 * Until the exercise has a logged session, the planner reads it as that exercise's only
 * history, so every algorithm starts from the lifter's real numbers. Never saved as a workout.
 */
export type StartingLift = { exerciseId?: string; exerciseName: string; weightKg: number; reps: number; enteredAtMs: number };

export const STARTING_LIFT_SESSION_ID = "starting-lift";

/** Reps the converted set leaves in the tank, for algorithms that repeat last session's sets. */
const WORKING_SET_RIR = 3;

/**
 * The history entry a starting lift stands in for. Estimate-based algorithms (LogIt Adaptive,
 * waves, plugins) get the set as entered. Linear-style ones add a rep to last session's sets,
 * which is too much after a max, so they get a working set at `workingReps` instead.
 */
export function startingLiftEntry(lift: StartingLift, opts: { workingReps?: number } = {}): ExerciseHistoryEntry {
  let { weightKg: weight, reps } = lift;
  if (opts.workingReps) {
    reps = opts.workingReps;
    const raw = estimated1RM(lift.weightKg, lift.reps) / (1 + (reps + WORKING_SET_RIR) / 30);
    weight = Math.max(0, Math.floor(raw / 2.5) * 2.5);
  }
  return {
    sessionId: STARTING_LIFT_SESSION_ID,
    performedAtMs: lift.enteredAtMs,
    sets: [{ id: STARTING_LIFT_SESSION_ID, weight, reps, completed: true, setType: "normal", orderIndex: 0 }],
  };
}

/** "Planned from the best lift you entered: 150 kg × 5." */
export function startingLiftLine(lift: StartingLift): string {
  return `Planned from the best lift you entered: ${+lift.weightKg.toFixed(2)} kg × ${lift.reps}. Once you've logged this exercise, your own sets take over.`;
}
