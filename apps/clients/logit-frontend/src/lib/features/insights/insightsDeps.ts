import { get } from "svelte/store";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import type { InsightDeps } from "@logit/core/usecases/insights/getInsightAnswers";
import type { WorkoutSession } from "@logit/core/domain/workout";
import type { WeightUnit } from "@logit/core/domain/units";
import { DEFAULT_INSIGHT_RANGE, isInsightRange, type InsightRange } from "@logit/core/domain/insights";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { getNutritionDeps } from "$lib/features/nutrition/deps";
import { activeGoals, goalsStore } from "$lib/features/goals/goalsStore";
import { loadGoalViews } from "$lib/features/goals/goalProgress";
import { loadVolumeContext, sessionVolumeKg } from "$lib/features/bodyweight/bodyweight";
import { profile } from "$lib/stores/profile.store";

/**
 * The phone's data for the Insights questions: all local, so they work offline and on Free.
 * The answers themselves are built in core, the same as on the dashboard.
 */
export async function phoneInsightDeps(): Promise<{ deps: InsightDeps; unit: WeightUnit }> {
  const unit: WeightUnit = get(profile).weightUnit === "lbs" ? "lbs" : "kg";
  const state = get(goalsStore);
  const ctx = await loadVolumeContext().catch(() => null);
  const nutrition = getNutritionDeps();
  return {
    unit,
    deps: {
      progression: getProgressionDeps(),
      nutrition,
      streak: state.streak,
      sessionVolumeKg: (s: WorkoutSession) => sessionVolumeKg(s, ctx),
      loadGoalViews: () => loadGoalViews(activeGoals(state), unit),
    },
  };
}

const RANGE_KEY = "logit:insights-range:v1";

export function savedRange(): InsightRange {
  try {
    const v = getAccountItem(RANGE_KEY);
    return isInsightRange(v) ? v : DEFAULT_INSIGHT_RANGE;
  } catch {
    return DEFAULT_INSIGHT_RANGE;
  }
}

export function rememberRange(r: InsightRange): void {
  try { setAccountItem(RANGE_KEY, r); } catch {}
}
