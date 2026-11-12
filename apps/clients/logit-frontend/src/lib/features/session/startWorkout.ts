import { get } from "svelte/store";
import { goto } from "$app/navigation";
import type { WorkoutSplit, SplitDay } from "@logit/core/domain/WorkoutSplit";
import { currentSession } from "$lib/stores/currentSession.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { selectedDayOverride } from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { getScheduleMode } from "$lib/usecases/Splits/splitRotation";

/** "Day 2 — Legs", or "Day 2" for an unnamed day. */
export function splitDayLabel(day: Pick<SplitDay, "orderIndex" | "name">): string {
  return day.name ? `Day ${day.orderIndex + 1} — ${day.name}` : `Day ${day.orderIndex + 1}`;
}

/**
 * The day to train today: the one picked on the Today's plan widget if there is one,
 * else the one the schedule says. `scheduled` is what the rotation would record.
 */
export function plannedDay(split: WorkoutSplit | null): { day: SplitDay | null; scheduled: SplitDay | null } {
  if (!split) return { day: null, scheduled: null };
  const scheduled = getTodaySplitDay(split);
  const override = get(selectedDayOverride);
  const day =
    override?.splitId === split.id
      ? (split.days.find((d) => d.id === override.dayId) ?? scheduled)
      : scheduled;
  return { day, scheduled };
}

/** Start an empty workout (unless one is running) and open it. */
export async function startEmptyWorkout(): Promise<void> {
  if (get(currentSession) === null) await currentSession.start();
  await goto("/session/current");
}

/**
 * Open today's planned day on the plan screen, or the running workout if there is one.
 * With no active split (or no day in it) the plan to start lives on the splits page.
 */
export async function startPlannedWorkout(): Promise<void> {
  if (get(currentSession) !== null) {
    await goto("/session/current");
    return;
  }
  // The button was drawn from the active split; if it isn't loaded now (a sync or
  // account switch reloading it), load it rather than fall back to an empty workout.
  const split = get(activeSplit) ?? (await activeSplit.load());
  const { day, scheduled } = plannedDay(split);

  if (split && day) {
    // "original" schedule mode advances by the scheduled day so the rotation
    // stays on track; "bump" advances by what you actually did.
    // Recorded by the plan screen when Start is pressed, so backing out of
    // the plan doesn't move the rotation on.
    const toRecord = getScheduleMode() === "original" ? scheduled : day;
    const params = new URLSearchParams({ split: split.id, day: day.id });
    if (toRecord) params.set("record", toRecord.id);
    await goto(`/session/plan?${params}`);
    return;
  }
  await goto("/splits");
}
