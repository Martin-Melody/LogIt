// Where a finished workout goes (design canvas O5 and O6). After the first workout of a plan
// from onboarding: "When will you train?" and then, without an account, the offer to save
// the training. "Not now" is respected: the offer comes back once more after workout 3, then
// only in Settings.
import { apiClient } from "@logit/core/api/client";
import { getAccountItem, removeAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { markWeekDoneShown, weekDoneShown } from "./firstWeek";

const FIRST_WORKOUT_KEY = "logit:onboarding:firstWorkoutPending";
const SAVE_ASKED_KEY = "logit:onboarding:saveAsked";

/** Set when onboarding saves a plan: the next finished workout is the first. */
export function markFirstWorkoutPending(): void {
  setAccountItem(FIRST_WORKOUT_KEY, "1");
}

export function saveAskedCount(): number {
  return parseInt(getAccountItem(SAVE_ASKED_KEY) ?? "0", 10) || 0;
}

export function markSaveAsked(): void {
  setAccountItem(SAVE_ASKED_KEY, String(saveAskedCount() + 1));
}

/**
 * The screen after finishing a workout. `workoutsBefore` is how many were saved before this
 * one. Reading it uses up the first-workout screen.
 */
export function afterWorkoutRoute(sessionId: string, workoutsBefore: number, firstWeekJustDone = false): string {
  if (getAccountItem(FIRST_WORKOUT_KEY)) {
    removeAccountItem(FIRST_WORKOUT_KEY);
    return `/onboarding/first-workout?id=${encodeURIComponent(sessionId)}`;
  }
  if (firstWeekJustDone && !weekDoneShown()) {
    markWeekDoneShown();
    return "/onboarding/week-done";
  }
  if (!apiClient.isAuthenticated() && saveAskedCount() === 1 && workoutsBefore + 1 === 3) {
    return `/onboarding/first-workout?id=${encodeURIComponent(sessionId)}&save=again`;
  }
  return "/";
}

/**
 * True when this workout completes the first week of a plan from onboarding (as many workouts
 * this week as the weekly target).
 */
export async function completesFirstWeek(session: { startedAtMs: number; source?: { dayId?: string } | null }): Promise<boolean> {
  const { localDateIso } = await import("@logit/core/domain/nutrition");
  const { inFirstWeek } = await import("./firstWeek");
  const todayIso = localDateIso();
  if (!inFirstWeek(todayIso) || weekDoneShown()) return false;
  const { get } = await import("svelte/store");
  const { activeSplit } = await import("$lib/stores/activeSplit.store");
  const { goalsStore } = await import("$lib/features/goals/goalsStore");
  const { getWorkoutRepo } = await import("$lib/data/repoProvider");
  const { planWeek } = await import("@logit/core/domain/weekPlan");
  const { targetForWeek } = await import("@logit/core/domain/weeklyStreak");
  const { weekStartIso } = await import("@logit/core/domain/dateIso");
  const split = get(activeSplit);
  if (!split || split.schedule !== "weekdays") return false;
  const sessions = (await getWorkoutRepo().listRecentSessions({ limit: 30 })).filter((s) => s.endedAtMs != null && s.id !== (session as { id?: string }).id);
  const week = planWeek(split, [...sessions, session], todayIso, (await import("./firstWeek")).planStartIso());
  const streak = get(goalsStore).streak;
  return week.done >= targetForWeek(weekStartIso(todayIso), streak.targetHistory, streak.weeklyTarget);
}
