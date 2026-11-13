import { get } from "svelte/store";
import { computeWeeklyStreak, type WeeklyStreak } from "@logit/core/domain/weeklyStreak";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { goalsStore } from "./goalsStore";

/** Local calendar day of a workout (a late-evening session counts for that evening, not UTC's). */
export function trainedDayIso(session: { startedAtMs: number }): string {
  return localDateIso(new Date(session.startedAtMs));
}

/** The weekly streak from all finished workouts and this account's target and pauses. */
export async function loadWeeklyStreak(nowMs = Date.now()): Promise<WeeklyStreak> {
  const sessions = await getWorkoutRepo().listAllSessions();
  const { streak } = get(goalsStore);
  return computeWeeklyStreak({
    // On the phone the draft is a row in the same table; it isn't a workout until finished.
    trainedDaysIso: sessions.filter((s) => s.endedAtMs != null).map(trainedDayIso),
    weeklyTarget: streak.weeklyTarget,
    targetHistory: streak.targetHistory,
    pauses: streak.pauses,
    todayIso: localDateIso(new Date(nowMs)),
  });
}
