// Saving the plan onboarding built (core domain/starterPlan.ts): the split becomes the active
// one on its weekday schedule, each exercise gets the goal's rep range (synced like a change
// made in Exercise › How it progresses), and the days a week become the weekly target.
import { splits } from "$lib/stores/splits.store";
import { goalsStore } from "$lib/features/goals/goalsStore";
import { saveSplit } from "$lib/usecases/Splits/saveSplit";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { pushExerciseSetting } from "$lib/sync/syncService";
import { saveExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
import { starterPlanToSplit, starterRepRanges, type StarterPlan } from "@logit/core/domain/starterPlan";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { markFirstWorkoutPending } from "./afterWorkout";

export async function saveStarterPlan(plan: StarterPlan): Promise<WorkoutSplit> {
  const split = starterPlanToSplit(plan);
  await saveSplit(split);
  await splits.setActive(split.id);
  goalsStore.setWeeklyTarget(plan.daysPerWeek);
  const deps = getProgressionDeps();
  for (const r of starterRepRanges(plan)) {
    const row = await saveExerciseProgressionSettings({ id: r.id, name: r.name }, { repRange: r.repRange }, deps);
    if (row) pushExerciseSetting(row);
  }
  markFirstWorkoutPending();
  return split;
}
