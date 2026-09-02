import { get } from "svelte/store";
import { goto } from "$app/navigation";
import type { WidgetAction } from "@logit/core/plugins/widgetView";
import { currentSession } from "$lib/stores/currentSession.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import {
  selectedDayOverride,
  selectDayOverride,
  clearDayOverride,
} from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { getScheduleMode, advanceRotation } from "$lib/usecases/Splits/splitRotation";
import { getHabitRepo } from "$lib/data/repoProvider";
import { localDateIso } from "@logit/core/domain/nutrition";
import { createHabitEntry, isSatisfied } from "@logit/core/domain/habit";
import { bumpHabits } from "$lib/features/habits/store";

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
      if (habit.target) {
        // Numeric habits: one tap logs the full target; tapping again clears it.
        await repo.saveEntry(
          createHabitEntry(habit.id, today, {
            ...(entry ?? {}),
            done: !satisfied,
            value: satisfied ? 0 : habit.target.value,
          }),
        );
      } else {
        await repo.saveEntry(
          createHabitEntry(habit.id, today, { ...(entry ?? {}), done: !satisfied }),
        );
      }
      bumpHabits();
    })();
    return;
  }

  if ("cycleDay" in action) {
    const split = get(activeSplit);
    if (!split || split.days.length < 2) return;
    const days = [...split.days].sort((a, b) => a.orderIndex - b.orderIndex);
    const override = get(selectedDayOverride);
    const current =
      override?.splitId === split.id
        ? days.findIndex((d) => d.id === override.dayId)
        : days.findIndex((d) => d.id === (getTodaySplitDay(split)?.id ?? ""));
    const from = current < 0 ? 0 : current;
    const next = days[(from + action.cycleDay + days.length) % days.length]!;
    selectDayOverride(split.id, next.id);
    return;
  }

  if ("startEmptyWorkout" in action) {
    void (async () => {
      if (get(currentSession) === null) await currentSession.start();
      await goto("/session/current");
    })();
    return;
  }

  if ("startPlannedWorkout" in action) {
    void (async () => {
      if (get(currentSession) !== null) {
        await goto("/session/current");
        return;
      }
      const split = get(activeSplit);
      const scheduled = split ? getTodaySplitDay(split) : null;
      const override = get(selectedDayOverride);
      const day =
        split && override?.splitId === split.id
          ? (split.days.find((d) => d.id === override.dayId) ?? scheduled)
          : scheduled;

      if (split && day) {
        // "original" schedule mode advances by the scheduled day so the rotation
        // stays on track; "bump" advances by what you actually did.
        const toRecord = getScheduleMode() === "original" ? scheduled : day;
        if (toRecord) advanceRotation(split.id, toRecord.id);
        clearDayOverride();
        await currentSession.startFromSplitDay(day);
      } else {
        await currentSession.start();
      }
      await goto("/session/current");
    })();
    return;
  }
}
