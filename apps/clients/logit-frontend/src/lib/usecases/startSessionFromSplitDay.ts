import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
import type { MobilitySide, WorkoutSession } from "@logit/core/domain/workout";
import { padPlannedSets, splitDaySession } from "@logit/core/domain/splitDaySession";
import { planSession, type SessionPlan } from "@logit/core/usecases/progression/planSession";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { get } from "svelte/store";
import { profile } from "$lib/stores/profile.store";

/**
 * The session a split day turns into, with every strength block's sets planned
 * by the user's progression algorithm (weights and rep targets filled in), drills
 * with their sets and targets, and the day's supersets and circuits as groups. Not
 * saved — the "Today's plan" screen shows this before anything starts.
 */
export async function planSplitDay(day: SplitDay, opts: { leadSide?: MobilitySide } = {}): Promise<SessionPlan> {
  // Drills lead with the side the user picked in Settings, like drills added by hand.
  const built = splitDaySession(day, { leadSide: opts.leadSide ?? get(profile).mobilityLeadSide });
  let plan: SessionPlan;
  try {
    plan = await planSession(built.session, getProgressionDeps(), built.targetsByBlockId);
  } catch {
    // A plan is a convenience; never let it stop a workout from starting.
    plan = { session: built.session, suggestions: {} };
  }
  // A group's rounds are its exercises' sets, and the split's own set targets stand in
  // where the algorithm planned nothing.
  return { ...plan, session: padPlannedSets(plan.session, built) };
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
