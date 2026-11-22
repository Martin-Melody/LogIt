import { plannedBlockName } from "@logit/core/domain/WorkoutSplit";
import type { WidgetDataNeed, WidgetInput } from "@logit/core/plugins/widgetView";
import { gatherWidgetInputFrom } from "@logit/core/plugins/widgetInputGather";
import { log } from "@logit/core/platform/log";
import { localDateIso } from "@logit/core/domain/nutrition";
import { addDays } from "@logit/core/domain/dateIso";
import { getExerciseRepo, getHabitRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { getNutritionDeps } from "$lib/features/nutrition/deps";
import { profile } from "$lib/stores/profile.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { selectedDayOverride } from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { getSplitPlan, getSplitTimeline } from "$lib/usecases/Splits/splitRotation";
import { refreshWeekSessions } from "$lib/features/onboarding/weekSessions";
import { defaultTimelineIndex, nextWorkoutAfter, splitDayName, splitDayTitle } from "@logit/core/domain/splitSchedule";
import type { SplitDay, WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { get } from "svelte/store";

/**
 * Load exactly the data slices a widget declared it needs, and shape them into a
 * WidgetInput (core gatherWidgetInputFrom, shared with the dashboard). Built-in widgets
 * get the object directly; community widgets get it JSON-serialised into the sandbox.
 */
type PlanInput = NonNullable<WidgetInput["todaysPlan"]>;

/**
 * The Today's plan card's page: by default the next workout, with the approved headings
 * (Later today / Tomorrow / Rest tomorrow / Rest day); paged with ‹ ›, any date in the
 * coming days, rest days included (core splitTimeline).
 */
function todaysPlanInput(
  split: WorkoutSplit,
  scheduled: SplitDay | null,
  override: { dayId: string | null; dateIso?: string } | null,
): PlanInput {
  const plan = getSplitPlan(split);
  const timeline = getSplitTimeline(split);
  const today = localDateIso();
  // The rotation records a day when its workout starts; while it's running it isn't done yet.
  const runningDayId = get(currentSession)?.source?.dayId;
  const finishedToday = plan.doneToday.filter((d) => d.id !== runningDayId);
  const doneToday = finishedToday.length ? { doneToday: finishedToday.map((d) => splitDayName(split, d)) } : {};
  const blocksOf = (d: SplitDay | null) =>
    d ? [...d.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map(plannedBlockName) : [];

  if (timeline.length === 0) {
    // No calendar to place days on (weekday split with no weekdays yet): plain day list.
    const days = [...split.days].filter((d) => !d.rest).sort((a, b) => a.orderIndex - b.orderIndex);
    const day = (override?.dayId ? days.find((d) => d.id === override.dayId) : null) ?? scheduled;
    return {
      splitId: split.id,
      dayLabel: day ? splitDayTitle(split, day) : undefined,
      scheduled: !!(day && scheduled && day.id === scheduled.id),
      dayIndex: day ? days.findIndex((d) => d.id === day.id) : undefined,
      dayCount: days.length,
      exercises: blocksOf(day),
      ...doneToday,
    };
  }

  const fallback = defaultTimelineIndex(timeline);
  const picked = override?.dateIso
    ? timeline.findIndex((e) => e.dateIso === override.dateIso && (e.day?.id ?? null) === override.dayId)
    : -1;
  const index = picked >= 0 ? picked : fallback;
  const entry = timeline[index]!;
  const base = {
    splitId: split.id,
    dayLabel: entry.day ? splitDayTitle(split, entry.day) : undefined,
    scheduled: false,
    dayIndex: index,
    dayCount: timeline.length,
    exercises: blocksOf(entry.day),
    dateIso: entry.dateIso,
    ...(entry.day ? {} : { rest: true }),
    ...(entry.done ? (entry.day?.id === runningDayId ? { inProgress: true } : { done: true }) : {}),
    ...doneToday,
  };
  if (index !== fallback) return { ...base, picked: true };

  // The page the card opens on: headed by its own day like the rest, with notes on what's
  // done today and the rest days before it.
  let when: PlanInput["when"];
  if (entry.dateIso === today) when = finishedToday.length ? "laterToday" : "today";
  else if (plan.restToday) when = "restToday";
  else when = entry.dateIso === addDays(today, 1) ? "tomorrow" : "upcoming";
  const restBefore = [
    ...new Set(timeline.filter((e) => !e.day && e.dateIso > today && e.dateIso < entry.dateIso).map((e) => e.dateIso)),
  ];
  // Opened on today's done workout or rest day: say what's next.
  const next = !entry.day || (entry.done && entry.day.id !== runningDayId) ? nextWorkoutAfter(timeline, index) : null;
  return {
    ...base,
    scheduled: !!(entry.day && scheduled && entry.day.id === scheduled.id),
    when,
    ...(plan.restToday ? { restToday: true } : {}),
    ...(restBefore.length ? { restBefore } : {}),
    ...(next?.day ? { nextUp: { dateIso: next.dateIso, label: splitDayName(split, next.day) } } : {}),
  };
}

export async function gatherWidgetInput(needs: WidgetDataNeed[]): Promise<WidgetInput> {
  const p = get(profile);
  // Today's plan of a plan from onboarding moves missed workouts: it needs this week's.
  await refreshWeekSessions();
  return gatherWidgetInputFrom(needs, {
    workoutRepo: getWorkoutRepo(),
    exerciseRepo: getExerciseRepo(),
    habitRepo: getHabitRepo(),
    nutritionDeps: getNutritionDeps(),
    progressionDeps: getProgressionDeps(),
    fallbackWeightKg: p.weight != null && p.weightUnit === "kg" ? p.weight : null,
    weightUnit: (p.weightUnit as "kg" | "lbs") ?? "kg",
    plan: () => {
      const split = get(activeSplit);
      const scheduled = split ? getTodaySplitDay(split) : null;
      const override = split && get(selectedDayOverride)?.splitId === split.id ? get(selectedDayOverride) : null;
      // What Start would start: a workout page picked on the card, else the scheduled one.
      const startDay =
        split && override?.dayId ? (split.days.find((d) => d.id === override.dayId) ?? scheduled) : scheduled;
      return {
        session: {
          active: get(currentSession) !== null,
          hasPlan: !!scheduled,
          plannedDayLabel: startDay && split ? splitDayTitle(split, startDay) : undefined,
        },
        todaysPlan: split ? todaysPlanInput(split, scheduled, override) : { scheduled: false, exercises: [] },
      };
    },
    onSliceError: (need, e) => log.warn("widget", `Couldn't load ${need} for a widget`, e),
  });
}
