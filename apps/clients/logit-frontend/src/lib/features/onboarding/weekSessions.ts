// Plans from onboarding carry a missed workout forward through the week (design canvas O8;
// core weekPlan.ts). Today's plan is worked out synchronously, so the workouts it needs are
// kept here, refreshed whenever Home gathers its cards and after each workout.
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { WorkoutSession } from "@logit/core/domain/workout";

let cache: WorkoutSession[] = [];

const flagKey = (splitId: string) => `logit:split-moves-missed:${splitId}`;

/** This split moves a missed workout to the next free day this week. */
export function movesMissed(splitId: string): boolean {
  return getAccountItem(flagKey(splitId)) === "1";
}

export function setMovesMissed(splitId: string): void {
  setAccountItem(flagKey(splitId), "1");
}

/** Finished workouts from the last few weeks, newest first (a draft isn't one). */
export function weekSessions(): WorkoutSession[] {
  return cache;
}

export async function refreshWeekSessions(): Promise<WorkoutSession[]> {
  try {
    cache = (await getWorkoutRepo().listRecentSessions({ limit: 30 })).filter((s) => s.endedAtMs != null);
  } catch {
    // Keep what we had.
  }
  return cache;
}
