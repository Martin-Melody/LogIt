import { get } from "svelte/store";
import { goto } from "$app/navigation";
import type { WidgetAction } from "@logit/core/plugins/widgetView";
import { currentSession } from "$lib/stores/currentSession.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { selectedDayOverride, clearDayOverride } from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { getScheduleMode, advanceRotation } from "$lib/usecases/Splits/splitRotation";

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
