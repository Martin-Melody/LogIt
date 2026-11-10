import type { ProgressionOutput } from "../../domain/progression";
import { suggestionToPlan } from "../../domain/progression";
import { applySetPlan, getExercises, type WorkoutSession } from "../../domain/workout";
import type { PlannedTargets } from "../../domain/WorkoutSplit";
import { getSuggestion } from "./getSuggestion";
import type { ProgressionDeps } from "./deps";

export type SessionPlan = {
  session: WorkoutSession;
  /** The suggestion behind each strength block's plan, by block id. */
  suggestions: Record<string, ProgressionOutput>;
};

/**
 * Plan every strength block in a session from the user's progression algorithm:
 * each block gets its prescribed sets created (weight and rep target filled in),
 * in session order so later exercises allow for the work planned before them.
 * Blocks with no suggestion (no algorithm picked, unknown exercise) are left as
 * they are. Logged sets are never touched — see applySetPlan.
 */
export async function planSession(
  session: WorkoutSession,
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo">,
  targetsByBlockId: Record<string, PlannedTargets | undefined> = {},
): Promise<SessionPlan> {
  let planned = session;
  const suggestions: Record<string, ProgressionOutput> = {};

  const blocks = getExercises(session).sort((a, b) => a.orderIndex - b.orderIndex);
  for (const block of blocks) {
    const exercise = { id: block.exerciseId, name: block.exerciseName };
    const output = await getSuggestion(exercise, deps, targetsByBlockId[block.id], planned);
    if (!output || output.sets.length === 0) continue;
    const machineId = block.sets.find((s) => s.machineId)?.machineId;
    suggestions[block.id] = output;
    planned = applySetPlan(planned, block.id, suggestionToPlan(output, machineId));
  }

  return { session: planned, suggestions };
}
