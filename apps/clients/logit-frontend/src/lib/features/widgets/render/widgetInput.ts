import type {
  WidgetDataNeed,
  WidgetInput,
  WidgetWorkout,
} from "@logit/core/plugins/widgetView";
import { getExercises } from "@logit/core/domain/workout";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import type { ProgressionOutput } from "@logit/core/domain/progression";
import {
  getExerciseRepo,
  getNutritionRepo,
  getProgressionRepo,
  getWorkoutRepo,
} from "$lib/data/repoProvider";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { getNutritionDeps } from "$lib/features/nutrition/deps";
import { totalsFor } from "$lib/features/nutrition/nutrition";
import { profile } from "$lib/stores/profile.store";
import { get } from "svelte/store";

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

  const tasks: Promise<void>[] = [];

  if (want.has("workouts")) {
    tasks.push(
      getWorkoutRepo()
        .listAllSessions()
        .then((sessions) => {
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
        const states = await getProgressionRepo().listExerciseStates();
        const top = [...states].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 6);
        const deps = getProgressionDeps();
        const rows = await Promise.all(
          top.map(async (s) => {
            const out = await getSuggestion(
              { id: s.exerciseId, name: s.exerciseName },
              deps,
            ).catch(() => null);
            return out ? { exerciseName: s.exerciseName, target: formatTarget(out) } : null;
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

  await Promise.all(tasks);
  return input;
}
