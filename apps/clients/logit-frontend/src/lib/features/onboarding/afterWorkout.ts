// Where a finished workout goes (design canvas O5 and O6). After the first workout of a plan
// from onboarding: "When will you train?" and then, without an account, the offer to save
// the training. "Not now" is respected: the offer comes back once more after workout 3, then
// only in Settings.
import { apiClient } from "@logit/core/api/client";
import { getAccountItem, removeAccountItem, setAccountItem } from "$lib/data/accountStorage";

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
export function afterWorkoutRoute(sessionId: string, workoutsBefore: number): string {
  if (getAccountItem(FIRST_WORKOUT_KEY)) {
    removeAccountItem(FIRST_WORKOUT_KEY);
    return `/onboarding/first-workout?id=${encodeURIComponent(sessionId)}`;
  }
  if (!apiClient.isAuthenticated() && saveAskedCount() === 1 && workoutsBefore + 1 === 3) {
    return `/onboarding/first-workout?id=${encodeURIComponent(sessionId)}&save=again`;
  }
  return "/";
}
