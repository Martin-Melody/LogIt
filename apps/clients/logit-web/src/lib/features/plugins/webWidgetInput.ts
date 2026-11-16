import type { WidgetDataNeed, WidgetInput } from "@logit/core/plugins/widgetView";
import { gatherWidgetInputFrom } from "@logit/core/plugins/widgetInputGather";
import { syncApi } from "@logit/core/api/syncApi";
import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { plannedBlockName } from "@logit/core/domain/WorkoutSplit";
import { defaultTimelineIndex, splitDayTitle, splitTimeline } from "@logit/core/domain/splitSchedule";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getOwnNutritionDeps, getOwnProfile, getWebDeps, getWebSplitRepo } from "$lib/deps";
import { parseRows, progressFor } from "$lib/features/overview/overviewData";

/**
 * A widget's input from your synced data, for the dashboard: the same slices the phone builds
 * (core gatherWidgetInputFrom), read from the server's copies. No workout is ever running
 * here, so `session.active` is false.
 */
export async function gatherWebWidgetInput(needs: readonly WidgetDataNeed[]): Promise<WidgetInput> {
  const want = new Set(needs);
  const deps = getWebDeps();
  const profile = await getOwnProfile();
  const todayIso = localDateIso(new Date());

  let plan: Pick<WidgetInput, "session" | "todaysPlan"> = {};
  if (want.has("session") || want.has("todaysPlan")) {
    const splits = await getWebSplitRepo().getListSplits().catch(() => [] as WorkoutSplit[]);
    const split = splits.find((s) => s.id === profile?.activeSplitId) ?? null;
    const timeline = split ? splitTimeline(split, progressFor(split, profile ?? null, todayIso), todayIso) : [];
    const entry = timeline.length ? timeline[defaultTimelineIndex(timeline)]! : null;
    const today = entry && entry.dateIso === todayIso && entry.day ? entry.day : null;
    plan = {
      session: { active: false, hasPlan: !!today, plannedDayLabel: split && today ? splitDayTitle(split, today) : undefined },
      todaysPlan:
        split && entry
          ? {
              splitId: split.id,
              dayLabel: entry.day ? splitDayTitle(split, entry.day) : undefined,
              scheduled: !!today,
              dayIndex: timeline.indexOf(entry),
              dayCount: timeline.length,
              exercises: entry.day ? [...entry.day.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map(plannedBlockName) : [],
              dateIso: entry.dateIso,
              ...(entry.day ? {} : { rest: true }),
              ...(entry.done ? { done: true } : {}),
            }
          : { scheduled: false, exercises: [] },
    };
  }

  return gatherWidgetInputFrom(needs, {
    workoutRepo: deps.workoutRepo,
    exerciseRepo: deps.exerciseRepo,
    habitRepo: {
      async listHabits() {
        const { habits } = await syncApi.pullHabits(0);
        return parseRows<Habit>(habits).filter((h) => !h.archived);
      },
      async listEntries(opts) {
        const { entries } = await syncApi.pullHabitEntries(0);
        return parseRows<HabitEntry>(entries).filter(
          (e) => (!opts?.fromIso || e.dateIso >= opts.fromIso) && (!opts?.toIso || e.dateIso <= opts.toIso),
        );
      },
    },
    nutritionDeps: getOwnNutritionDeps(),
    progressionDeps: deps,
    fallbackWeightKg: profile?.weight != null && profile.weightUnit === "kg" ? profile.weight : null,
    weightUnit: profile?.weightUnit === "lbs" ? "lbs" : "kg",
    plan: () => plan,
  });
}
