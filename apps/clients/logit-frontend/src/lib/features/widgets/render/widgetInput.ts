import type {
  WidgetDataNeed,
  WidgetInput,
  WidgetWorkout,
} from "@logit/core/plugins/widgetView";
import { getExercises } from "@logit/core/domain/workout";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import { computeStreak, dueOn, isSatisfied, weekProgress } from "@logit/core/domain/habit";
import { addDays } from "@logit/core/domain/dateIso";
import type { ProgressionOutput } from "@logit/core/domain/progression";
import {
  getExerciseRepo,
  getHabitRepo,
  getNutritionRepo,
  getWorkoutRepo,
} from "$lib/data/repoProvider";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { getNutritionDeps } from "$lib/features/nutrition/deps";
import { totalsFor } from "$lib/features/nutrition/nutrition";
import { profile } from "$lib/stores/profile.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { selectedDayOverride } from "$lib/stores/todaysPlan.store";
import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
import { get } from "svelte/store";

function dayLabel(idx: number, name?: string): string {
  return name ? `Day ${idx + 1} — ${name}` : `Day ${idx + 1}`;
}

function formatTarget(o: ProgressionOutput): string {
  const first = o.sets[0];
  if (!first) return o.label ?? "—";
  const reps = Array.isArray(first.reps) ? `${first.reps[0]}–${first.reps[1]}` : String(first.reps);
  return `${o.sets.length}×${reps} @ ${first.weight}kg`;
}

/**
 * Load exactly the data slices a widget declared it needs, and shape them into a
 * WidgetInput. Built-in widgets get the object directly; community widgets get
 * it JSON-serialised into the sandbox.
 */
export async function gatherWidgetInput(needs: WidgetDataNeed[]): Promise<WidgetInput> {
  const want = new Set(needs);
  const p = get(profile);
  const fallbackWeightKg =
    p.weight != null && p.weightUnit === "kg" ? p.weight : null;

  const input: WidgetInput = {
    now: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    prefs: { weightUnit: (p.weightUnit as "kg" | "lbs") ?? "kg" },
  };

  if (want.has("session") || want.has("todaysPlan")) {
    const split = get(activeSplit);
    const scheduled = split ? getTodaySplitDay(split) : null;
    const override = get(selectedDayOverride);
    const day =
      split && override?.splitId === split.id
        ? (split.days.find((d) => d.id === override.dayId) ?? scheduled)
        : scheduled;

    if (want.has("session")) {
      input.session = {
        active: get(currentSession) !== null,
        hasPlan: !!scheduled,
        plannedDayLabel: day ? dayLabel(day.orderIndex, day.name) : undefined,
      };
    }
    if (want.has("todaysPlan")) {
      const sortedDays = split ? [...split.days].sort((a, b) => a.orderIndex - b.orderIndex) : [];
      const blocks = day ? [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : [];
      input.todaysPlan = {
        splitId: split?.id,
        dayLabel: day ? dayLabel(day.orderIndex, day.name) : undefined,
        scheduled: !!(day && scheduled && day.id === scheduled.id),
        dayIndex: day ? sortedDays.findIndex((d) => d.id === day.id) : undefined,
        dayCount: sortedDays.length,
        exercises: blocks.map((b) =>
          b.type === "strength" ? b.exerciseName : b.activityName,
        ),
      };
    }
  }

  const tasks: Promise<void>[] = [];

  if (want.has("workouts")) {
    tasks.push(
      getWorkoutRepo()
        .listAllSessions()
        .then((all) => {
          // Bound what we hand widgets (and serialise into the sandbox):
          // recent history only.
          const cutoff = Date.now() - 200 * 24 * 60 * 60 * 1000;
          const sessions = all
            .filter((s) => (s.endedAtMs ?? s.startedAtMs) >= cutoff)
            .slice(0, 150);
          input.workouts = sessions.map(
            (s): WidgetWorkout => ({
              id: s.id,
              startedAtMs: s.startedAtMs,
              endedAtMs: s.endedAtMs ?? undefined,
              exercises: getExercises(s).map((ex) => ({
                exerciseId: ex.exerciseId ?? undefined,
                name: ex.exerciseName,
                sets: ex.sets.map((set) => ({
                  weight: Number(set.weight) || 0,
                  reps: Number(set.reps) || 0,
                  type: set.setType,
                })),
              })),
            }),
          );
        }),
    );
  }

  if (want.has("exercises")) {
    tasks.push(
      getExerciseRepo()
        .list()
        .then((all) => {
          input.exercises = all.map((e) => ({
            id: e.id,
            name: e.name,
            primaryMuscles: e.primaryMuscles ?? [],
            secondaryMuscles: e.secondaryMuscles ?? [],
          }));
        }),
    );
  }

  if (want.has("progressionTargets")) {
    tasks.push(
      (async () => {
        const deps = getProgressionDeps();
        // Which exercises to show: the most recently *trained* ones, from real session
        // history — not progression_states, which only gets a row once a session finishes
        // *after* an algorithm was already configured. A user with plenty of existing
        // history and a freshly-picked (or freshly-defaulted) algorithm should see
        // suggestions immediately, using getSuggestion()'s own history-based fallback for an
        // exercise it's never explicitly tracked state for — not be told to start from
        // scratch just because the state cache is still empty.
        const recentSessions = await getWorkoutRepo().listRecentSessions({ limit: 20 });
        const seen = new Set<string>();
        const candidates: { id?: string; name: string }[] = [];
        outer: for (const session of recentSessions) {
          for (const ex of getExercises(session)) {
            const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ id: ex.exerciseId, name: ex.exerciseName });
            if (candidates.length >= 6) break outer;
          }
        }
        const rows = await Promise.all(
          candidates.map(async (c) => {
            const out = await getSuggestion({ id: c.id, name: c.name }, deps).catch(() => null);
            return out ? { exerciseName: c.name, target: formatTarget(out) } : null;
          }),
        );
        input.progressionTargets = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      })(),
    );
  }

  if (want.has("nutrition") || want.has("bodyweight")) {
    tasks.push(
      (async () => {
        const nut = await getNutritionTargets(getNutritionDeps(), { fallbackWeightKg }).catch(
          () => null,
        );
        if (!nut) return;

        if (want.has("nutrition")) {
          const day = await getNutritionRepo().getDay(localDateIso()).catch(() => null);
          const consumed = totalsFor(day);
          input.nutrition = {
            hasGoal: !!nut.goal || !!nut.coachPlan,
            sourceLabel: nut.targets?.sourceLabel,
            targetKcal: nut.targets?.kcal,
            consumedKcal: consumed.kcal,
            targetMacros: nut.targets
              ? {
                  proteinG: nut.targets.macros.proteinG,
                  carbsG: nut.targets.macros.carbsG,
                  fatG: nut.targets.macros.fatG,
                }
              : undefined,
            consumedMacros: {
              proteinG: consumed.proteinG,
              carbsG: consumed.carbsG,
              fatG: consumed.fatG,
            },
          };
        }

        if (want.has("bodyweight")) {
          input.bodyweight = {
            currentKg: nut.trend.currentKg ?? undefined,
            weeklyRateKg: nut.trend.weeklyRateKg,
            targetKg: nut.goal?.targetWeightKg ?? undefined,
            trendPoints: nut.trend.points.map((pt) => ({ dateIso: pt.dateIso, kg: pt.smoothedKg })),
          };
        }
      })(),
    );
  }

  if (want.has("habits")) {
    tasks.push(
      (async () => {
        const repo = getHabitRepo();
        const habits = await repo.listHabits();
        if (habits.length === 0) {
          input.habits = [];
          return;
        }
        const today = localDateIso();
        // Streaks need history; 100 days back covers any realistic run.
        const fromIso = addDays(today, -100);
        const entries = await repo.listEntries({ fromIso, toIso: today });
        const byHabit = new Map<string, typeof entries>();
        for (const e of entries) {
          const list = byHabit.get(e.habitId) ?? [];
          list.push(e);
          byHabit.set(e.habitId, list);
        }
        input.habits = habits.map((h) => {
          const hEntries = byHabit.get(h.id) ?? [];
          const todayEntry = hEntries.find((e) => e.dateIso === today);
          const wp = weekProgress(h, hEntries, today);
          return {
            id: h.id,
            name: h.name,
            icon: h.icon,
            dueToday: dueOn(h, today),
            doneToday: isSatisfied(h, todayEntry),
            streak: computeStreak(h, hEntries, today),
            weekProgress: wp ?? undefined,
          };
        });
      })(),
    );
  }

  await Promise.all(tasks);
  return input;
}
