import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { PlannedTargets, SplitDay } from "@logit/core/domain/WorkoutSplit";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addCardioBlock,
} from "@logit/core/domain/workout";
import { planSession, type SessionPlan } from "@logit/core/usecases/progression/planSession";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * The session a split day turns into, with every strength block's sets planned
 * by the user's progression algorithm (weights and rep targets filled in). Not
 * saved — the "Today's plan" screen shows this before anything starts.
 */
export async function planSplitDay(day: SplitDay): Promise<SessionPlan> {
  let session = createSession();
  const targetsByBlockId: Record<string, PlannedTargets | undefined> = {};

  for (const block of sortByOrderIndex(day.blocks)) {
    if (block.type === "strength") {
      session = addExercise(session, {
        exerciseName: block.exerciseName,
        exerciseId: block.exerciseId,
      });
      targetsByBlockId[session.blocks.at(-1)!.id] = block.targets;
    } else if (block.type === "cardio") {
      session = addCardioBlock(session, block.activityName);
    }
  }

  try {
    return await planSession(session, getProgressionDeps(), targetsByBlockId);
  } catch {
    // A plan is a convenience; never let it stop a workout from starting.
    return { session, suggestions: {} };
  }
}

/** Save a planned session as the in-progress workout, timed from now. */
export async function startPlannedSession(session: WorkoutSession): Promise<WorkoutSession> {
  const started = { ...session, startedAtMs: Date.now() };
  await getWorkoutRepo().saveDraftSession(started);
  return started;
}

export async function startSessionFromSplitDay(day: SplitDay): Promise<WorkoutSession> {
  const { session } = await planSplitDay(day);
  return startPlannedSession(session);
}
