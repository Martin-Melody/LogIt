import { get } from "svelte/store";
import { goto } from "$app/navigation";
import type { WidgetAction } from "@logit/core/plugins/widgetView";
import { activeSplit } from "$lib/stores/activeSplit.store";
import {
  selectedDayOverride,
  selectDayOverride,
  clearDayOverride,
} from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { getSplitPlan, getSplitTimeline } from "$lib/usecases/Splits/splitRotation";
import { defaultTimelineIndex } from "@logit/core/domain/splitSchedule";
import { startEmptyWorkout, startPlannedWorkout } from "$lib/features/session/startWorkout";
import { getHabitRepo } from "$lib/data/repoProvider";
import { localDateIso } from "@logit/core/domain/nutrition";
import { createHabitEntry, isSatisfied } from "@logit/core/domain/habit";
import { bumpHabits } from "$lib/features/habits/store";
import { pushHabitEntry } from "$lib/sync/syncService";

/**
 * Host allow-list for widget actions. Community widgets can only trigger these
 * — no arbitrary code, no arbitrary navigation.
 */
export function runWidgetAction(action: WidgetAction): void {
  if ("navigate" in action) {
    if (action.navigate.startsWith("/")) void goto(action.navigate);
    return;
  }

  if ("resumeWorkout" in action) {
    void goto("/session/current");
    return;
  }

  if ("toggleHabit" in action) {
    void (async () => {
      const repo = getHabitRepo();
      const today = localDateIso();
      const [habit, entry] = await Promise.all([
        repo.getHabit(action.toggleHabit),
        repo.getEntry(action.toggleHabit, today),
      ]);
      if (!habit) return;
      const satisfied = isSatisfied(habit, entry ?? undefined);
      const next = habit.target
        ? // Numeric habits: one tap logs the full target; tapping again clears it.
          createHabitEntry(habit.id, today, {
            ...(entry ?? {}),
            done: !satisfied,
            value: satisfied ? 0 : habit.target.value,
          })
        : createHabitEntry(habit.id, today, { ...(entry ?? {}), done: !satisfied });
      await repo.saveEntry(next);
      pushHabitEntry(next);
      bumpHabits();
    })();
    return;
  }

  if ("cycleDay" in action) {
    const split = get(activeSplit);
    if (!split) return;
    const timeline = getSplitTimeline(split);
    const override = get(selectedDayOverride);
    if (timeline.length > 1) {
      // Step through the coming days, stopping at either end.
      const current =
        override?.splitId === split.id
          ? timeline.findIndex((e) => e.dateIso === override.dateIso && (e.day?.id ?? null) === override.dayId)
          : -1;
      const from = current >= 0 ? current : defaultTimelineIndex(timeline, getSplitPlan(split));
      const to = Math.max(0, Math.min(timeline.length - 1, from + action.cycleDay));
      if (to === from) return;
      const e = timeline[to]!;
      selectDayOverride(split.id, e.day?.id ?? null, e.dateIso);
      return;
    }
    // Nothing to place on a calendar (weekday split with no weekdays yet): step through days.
    const days = [...split.days].filter((d) => !d.rest).sort((a, b) => a.orderIndex - b.orderIndex);
    if (days.length < 2) return;
    const cur =
      override?.splitId === split.id
        ? days.findIndex((d) => d.id === override.dayId)
        : days.findIndex((d) => d.id === (getTodaySplitDay(split)?.id ?? ""));
    const next = days[((cur < 0 ? 0 : cur) + action.cycleDay + days.length) % days.length]!;
    selectDayOverride(split.id, next.id);
    return;
  }

  if ("startEmptyWorkout" in action) {
    void startEmptyWorkout();
    return;
  }

  if ("startPlannedWorkout" in action) {
    void startPlannedWorkout();
    return;
  }
}
