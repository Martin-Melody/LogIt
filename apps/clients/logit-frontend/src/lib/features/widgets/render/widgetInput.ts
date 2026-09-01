import type {
  WidgetDataNeed,
  WidgetInput,
  WidgetWorkout,
} from "@logit/core/plugins/widgetView";
import { getExercises } from "@logit/core/domain/workout";
import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { get } from "svelte/store";

/**
 * Load exactly the data slices a widget declared it needs, and shape them into a
 * WidgetInput. Built-in widgets get the object directly; community widgets get
 * it JSON-serialised into the sandbox.
 */
export async function gatherWidgetInput(needs: WidgetDataNeed[]): Promise<WidgetInput> {
  const want = new Set(needs);
  const p = get(profile);

  const input: WidgetInput = {
    now: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    prefs: { weightUnit: (p.weightUnit as "kg" | "lbs") ?? "kg" },
  };

  if (want.has("workouts")) {
    const sessions = await getWorkoutRepo().listAllSessions();
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
  }

  if (want.has("exercises")) {
    const all = await getExerciseRepo().list();
    input.exercises = all.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
    }));
  }

  // TODO(phase-6b): todaysPlan, nutrition, bodyweight slices.

  return input;
}
